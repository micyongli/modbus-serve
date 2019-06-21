
const Q = require('./rQueue');
const { readHold, writeHold,readInput } = require('./modbus');
const debug = require('debug')('modbus:rtu');
debug.enabled = true;

const reloader = require('./reloader');

const db = require('./db');
const net = require('net');

const device = {

};


function hasDev(devId) {
    return device[devId];
}

const timeoutSec = 60 * 1000;

function setClientTime(devId) {
    const d = hasDev(devId);
    if (d) {
        d['online'] = Date.now();
    }
}

function checkTimeout(devId) {
    const x = hasDev(devId);
    if (x) {
        const { online } = x;
        if (Date.now() - online >= timeoutSec) {
            debug('checkTimeout', devId);
            setImmediate(() => {
                unregDev(devId);
            });
        }
    }
}

function checker() {
    const keys = Object.keys(device);
    if (keys.length > 0) {
        for (let x of keys) {
            checkTimeout(x);
        }
    }
}

setInterval(checker, timeoutSec);

function regDev(devId, link) {
    const n = Date.now();
    if (hasDev(devId)) {
        device[devId]['link'] = link;
        return;
    }
    device[devId] = {
        devId,
        link,
        online: n,
        queue: new Q(10000)
    };
    let conn;
    db.getConnectionAsync()
        .then(c => conn = c)
        .then(() => {
            return conn.queryAsync('insert into device_line_log(device_id) values(?)', [devId]);
        })
        .catch(e => {
            debug(e);
        })
        .finally(() => {
            if (conn) {
                db.releaseConnection(conn);
            }
        });
}

function unregDev(devId) {
    if (device[devId]) {
        const sock = device[devId].link;
        try {
            sock.end();
        } catch (e) {
            debug(e);
        }
        delete device[devId];
    }
}

function devState() {
    const t = Date.now();
    return Object.keys(device).map(v => {
        const d = device[v];
        return {
            devId: v,
            time: t - d['online']
        }
    })
}


function requestHoldReadBE(devId, devAddress, register, count, callback) {

    const dev = hasDev(devId);
    if (dev) {
        dev.queue.en(
            {
                devId,
                devAddress,
                register,
                count,
                callback
            },

            //start
            ctx => {
                const b = readHold(devAddress, register, count);
                debug(b)
                dev.link.write(
                    b,
                    () => {
                        debug('write data to ', devId);
                        if (typeof callback === 'function')
                            callback('start', { ctx });
                    });
            },

            //stop
            (ctx, data) => {
                debug('completed ', data);
                resetRecvBuf(dev);
                if (typeof callback === 'function')
                    callback('completed', { ctx, data });
            },

            //timeout
            ctx => {
                debug('timeout', ctx);
                resetRecvBuf(dev);
                if (typeof callback === 'function')
                    callback('timeout', { ctx });
            }
        );
        return;
    }

    if (typeof callback === 'function') {

        callback(
            'offline', {
                ctx:
                {
                    devId,
                    devAddress,
                    register,
                    count,
                    callback
                }
            }
        );
    }

}

function requestInputReadBE(devId, devAddress, register, count, callback) {

    const dev = hasDev(devId);
    if (dev) {
        dev.queue.en(
            {
                devId,
                devAddress,
                register,
                count,
                callback
            },

            //start
            ctx => {
                const b = readInput(devAddress, register, count);
                debug(b)
                dev.link.write(
                    b,
                    () => {
                        debug('write data to ', devId);
                        if (typeof callback === 'function')
                            callback('start', { ctx });
                    });
            },

            //stop
            (ctx, data) => {
                debug('completed ', data);
                resetRecvBuf(dev);
                if (typeof callback === 'function')
                    callback('completed', { ctx, data });
            },

            //timeout
            ctx => {
                debug('timeout', ctx);
                resetRecvBuf(dev);
                if (typeof callback === 'function')
                    callback('timeout', { ctx });
            }
        );
        return;
    }

    if (typeof callback === 'function') {

        callback(
            'offline', {
                ctx:
                {
                    devId,
                    devAddress,
                    register,
                    count,
                    callback
                }
            }
        );
    }

}

function resetRecvBuf(dev) {
    if (dev.link && dev.link.modbusParser) {
        dev.link.modbusParser.reset();
    }
}


function requestHoldWriteBE(devId, devAddress, register, count, data, callback) {

    const dev = hasDev(devId);

    if (dev) {
        dev.queue.en(
            {
                devId,
                devAddress,
                register,
                count,
                callback,
                data
            },
            //start
            ctx => {
                const b = writeHold(devAddress, register, count, data);
                dev.link.write(
                    b,
                    () => {
                        debug('write data to ', devId);
                        if (typeof callback === 'function')
                            callback('start', { ctx });
                    });
            },
            //stop
            (ctx, data) => {
                resetRecvBuf(dev);
                debug('completed ', data);
                if (typeof callback === 'function')
                    callback('completed', { ctx, data });
            },
            //timeout
            ctx => {
                resetRecvBuf(dev);
                debug('timeout', ctx);
                if (typeof callback === 'function')
                    callback('timeout', { ctx });
            }
        );
        return;
    }

    if (typeof callback === 'function') {
        callback(
            'offline', {
                ctx:
                {
                    devId,
                    devAddress,
                    register,
                    count,
                    callback,
                    data
                }
            }
        );
    }

}

function respone(devId, data) {
    const dev = hasDev(devId);
    if (dev) {
        return dev.queue.completed(data);
    }
}

const device_config = {
    list: []
};


function deviceOnline(devId) {
    return hasDev(devId) ? true : false;
}


function reload(store) {
    let conn;
    return db.getConnectionAsync()
        .then(c => conn = c)
        .then(v => {
            return conn.queryAsync('select device_id from devices ');
        })
        .then(v => {
            const list = v.map(v => v['device_id']);
            debug(list)
            device_config['list'] = list;
        })
        .catch(e => {
            debug(e);
        })
        .finally(() => {
            if (conn) {
                db.releaseConnection(conn);
            }
        });
}


reloader.on('reload', () => {
    debug('reload')
    reload();
});

reload();


function devFilter(v) {
    const arr = device_config['list'];
    if (!Array.isArray(arr))
        return false;
    return arr.indexOf(v) >= 0;
}


module.exports = exports = {
    regDev,
    unregDev,
    devState,
    devFilter,
    respone,
    requestHoldWriteBE,
    requestHoldReadBE,
    requestInputReadBE,
    deviceOnline,
    setClientTime
};
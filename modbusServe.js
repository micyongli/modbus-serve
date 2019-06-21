
const debug = require('debug')('modbus:rtu');

debug.enabled = true;

const net = require('net');
const { Parser } = require('./modbus');
const { regDev, unregDev, devFilter, respone,setClientTime } = require('./device');
const config = require('./config');


const port = config.rtu.port;

const app = net.createServer();
app.listen(port, '0.0.0.0', () => {
    debug(`modbus rtu listen at ${port}`);
});



app.on('connection', client => {

    client.deviceId = null;
    debug(client.remoteAddress);
    client.setKeepAlive(true,1000);
    client.cleanId = function () {
        if (this.devId) {
            debug('clean id ')
            unregDev(this.devId);
            delete this.devId;
        }
    };


    client.on('data', data => {
        debug('recv ', data);
        if (!client.devId) {
            const devId = data.toString();
            client.devId = devId;
            debug(devId);
            if (!devFilter(devId)) {
                client.end();
                debug('close client');
                return;
            }
            regDev(devId, client);
            client.modbusParser = new Parser(1024);
            return;
        }

        setClientTime(client.devId);

        if (Parser.isPing(data)) {
            debug('this is ping package ');
            return;
        }

        const p = client.modbusParser;
        p.put(data);
        const r = p.parse();
        if (r) {
            respone(client.devId, r);
        }

    });

    client.on('end', () => {

        client.cleanId();
        debug('client end');

    });

    client.on('error', e => {

        client.cleanId();
        debug('error');

    });

    client.on('close', e => {

        client.cleanId();

        debug('close');

    });

    client.on('timeout', e => {
        log('timeout')
    });
})

app.on('error', e => {
    debug(e);
});
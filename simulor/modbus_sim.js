
const net = require('net');
const debug = require('debug')('modbus_sim:app');
const crc = require('../crc');
const { bufferCp, makeCmd } = require('../modbus');
debug.enabled = true;

const port = 9002;
const host = 'localhost';
const app = net.connect(port, host);


const max_register = 1024

const hold_buf = Buffer.alloc(max_register * 2);

const recv_buf = Buffer.alloc(256);
let recv_size = 0;

//**测试 */
hold_buf.writeUInt16BE(1234, 0);


debug(hold_buf)


function parser() {
    const recv = recv_buf;
    const recvSize = recv_size;
    if (recvSize > 6) {
        const addr = recv.readUInt8(0);
        const cmd = recv.readUInt8(1);
        const reg = recv.readUInt16BE(2);
        const count = recv.readUInt16BE(4);
        switch (cmd) {
            case 0x3:
                if (recvSize >= 8) {
                    const calCrc = crc.modebus_crc16(recv, 0, 6);
                    const orgCrc = recv.readUInt16LE(6);
                    if (calCrc == orgCrc) {

                        recv_size -= 8;
                        if (recv_size > 0) {
                            bufferCp(recv, 8, recv, 0, recv_size);
                        }
                        return {
                            addr,
                            cmd,
                            reg,
                            count
                        }
                    }

                } else {
                    return;
                }
                break;
            case 0x10:
                if (recvSize > 7) {
                    debug(recv)
                    const wrBytes = recv.readUInt8(6);
                    if (recvSize >= wrBytes + 9) {
                        const calCrc = crc.modebus_crc16(recv, 0, 7 + wrBytes);
                        const orgCrc = recv.readUInt16LE(7 + wrBytes);
                        debug(calCrc, orgCrc)
                        if (calCrc == orgCrc) {
                            const b = Buffer.alloc(wrBytes);
                            bufferCp(recv, 7, b, 0, wrBytes);
                            recv_size -= wrBytes + 9;
                            if (recv_size > 0) {
                                bufferCp(recv, wrBytes + 9, recv, 0, recv_size);
                            }

                            debug('write ')
                            return {
                                addr,
                                cmd,
                                reg,
                                count,
                                data: b
                            }
                        }
                    }

                } else {
                    return;
                }
                break;
            default:
                debug('unknown command');
        }

        debug(`recv buffer size ${recv_size}`);
    }
}


app.on('close', error => {


    debug('close', error);
});

app.on('data', async data => {
    const dataLen = data.length;
    bufferCp(data, 0, recv_buf, recv_size, dataLen);
    recv_size += dataLen;
    const result = parser();

    if (result) {
        const {
            addr,
            cmd,
            reg,
            count,
            data } = result;
        switch (cmd) {
            case 0x3:
                {
                    const b = Buffer.alloc(count * 2 + 1);
                    b.writeUInt8(count * 2, 0);
                    bufferCp(hold_buf, reg * 2, b, 1, count * 2);
                    const ncmd = makeCmd(addr, cmd, b);
                    debug('0x3 reply message', ncmd);
                    await writeAsync(app, ncmd);
                    break;
                }
            case 0x10:
                {
                    const b = Buffer.alloc(4);
                    b.writeUInt16BE(reg, 0);
                    b.writeUInt16BE(count, 2);
                    debug(data);
                    bufferCp(data, 0, hold_buf, reg * 2, count * 2);
                    const ncmd = makeCmd(addr, cmd, b);

                    debug('0x10 reply message', ncmd);
                    await writeAsync(app, ncmd);
                    break;
                }
        }
    }

});

app.on('error', error => {

    debug('error', error);
});

app.on('end', () => {
    debug('end event');
});


app.on('connect', async () => {
    debug('connect');
    await writeIdentify(app, 'P0001');
    setInterval(() => {
        writePing(app);
    }, 30000);
});


async function writePing(sock) {
    await writeIdentify(sock, 'pingpingping');
}

async function writeIdentify(sock, id) {
    const buf = Buffer.from(id);
    await writeAsync(sock, buf);
}



async function writeAsync(sock, data) {
    await new Promise((r, j) => {
        sock.write(data, err => {
            err ? j(err) : r();
        });
    });
}
const { modebus_crc16 } = require("./crc");
const debug = require("debug")("modbus:modbusjs");
debug.enabled = true;

class Parser {
  constructor(buf_size) {
    this.buf_size = buf_size;
    this.recv_buf = Buffer.alloc(buf_size);
    this.recv_size = 0;
  }

  put(d) {
    const l = d.length;
    bufferCp(d, 0, this.recv_buf, this.recv_size, l);
    this.recv_size += l;
    return this.recv_size;
  }

  dropPing() {
    debug("drop Ping ");
    let len = this.recv_size;
    const b = this.recv_buf;
    let count = 0;

    while (true) {
      if (len < 4) {
        const l = count * 4;
        debug("drop ping package ", l);
        if (l > 0) {
          bufferCp(b, l, b, 0, len);
          this.recv_size = len;
        }
        break;
      }
      if (b.readUInt32LE(count * 4) === 1735289200) {
        count++;
        len -= 4;
      } else {
        break;
      }
    }
  }

  parse() {
    this.dropPing();
    const l = this.recv_size;
    const b = this.recv_buf;
    let returnObj = null;
    if (l > 3) {
      const addr = b.readUInt8(0);
      const cmd = b.readUInt8(1);
      switch (cmd) {
        case 0x4:
        case 0x3:
          {
            const retBytes = b.readUInt8(2);
            const total = retBytes + 5;
            if (total <= l) {
              const calCrc = modebus_crc16(b, 0, retBytes + 3);
              const recvCrc = b.readUInt16LE(retBytes + 3);
              if (recvCrc === calCrc) {
                const rb = [];
                for (let inx = 0; inx < retBytes / 2; inx++) {
                  const v = b.readUInt16BE(3 + inx * 2);
                  rb.push(v);
                }
                returnObj = {
                  addr,
                  cmd,
                  data: rb
                };
              }
              const has = l - total;
              bufferCp(this.recv_buf, total, this.recv_buf, 0, has);
              this.recv_size = has;
            }
          }
          break;
        case 0x10:
          {
            //format : address cmd  reg cout crc16
            const total = 8;
            if (total <= l) {
              const calCrc = modebus_crc16(b, 0, 6);
              const recvCrc = b.readUInt16LE(6);
              const register = b.readUInt16BE(2);
              const count = b.readUInt16BE(4);
              if (recvCrc === calCrc) {
                returnObj = {
                  addr,
                  cmd,
                  register,
                  count
                };
              }
              const has = l - total;
              bufferCp(this.recv_buf, total, this.recv_buf, 0, has);
              this.recv_size = has;
            }
          }
          break;
      }
    }
    debug("buffer has size ", this.recv_size);
    if (this.recv_size >= 251) {
      this.recv_size = 0;
    }
    return returnObj;
  }

  static isPing(d) {
    if (d.length !== 4) {
      return false;
    }
    return d.readUInt32LE(0) === 1735289200;
  }

  reset() {
    debug("reset recev buffer size");
    this.recv_size = 0;
  }
}

function makeCmd(addr, cmd, data) {
  const bl = data.length;
  let len = bl + 4;
  let inx = 0;
  let buf = Buffer.alloc(len);
  buf.writeUInt8(addr, inx++);
  buf.writeUInt8(cmd, inx++);
  bufferCp(data, 0, buf, inx, bl);
  inx += bl;
  const crc = modebus_crc16(buf, 0, bl + 2);
  buf.writeUInt16LE(crc, inx++);
  return buf;
}

function readHold(addr, reg, count) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(reg, 0);
  buf.writeUInt16BE(count, 2);
  return makeCmd(addr, 3, buf);
}

function readInput(addr, reg, count) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(reg, 0);
  buf.writeUInt16BE(count, 2);
  return makeCmd(addr, 4, buf);
}

function writeHold(addr, reg, count, data) {
  const clone = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    clone.push(data[i]);
  }
  const bytes = count * 2;
  if (len < bytes) {
    for (let x = 0; x < bytes - len; x++) {
      clone.push(0);
    }
  }
  const buf = Buffer.alloc(4 + len + 1);
  buf.writeUInt16BE(reg, 0);
  buf.writeUInt16BE(count, 2);
  buf.writeUInt8(len, 4);
  bufferCp(clone, 0, buf, 5, bytes);
  return makeCmd(addr, 16, buf);
}

function bufferCp(s, soffset, t, toffset, len) {
  for (let x = 0; x < len; x++) {
    t[toffset + x] = s[soffset + x] & 0xff;
  }
}

function bufferSwap(s, soffset, t, toffset, len) {
  for (let x = 0; x < len; x++) {
    let tmp = s[soffset + x];
    s[soffset + x] = t[soffset + x];
    t[toffset + x] = tmp;
  }
}

function isRtuDev(b) {
  return /^p.*/i.test(b.toString());
}

module.exports = {
  readHold,
  writeHold,
  Parser,
  makeCmd,
  bufferCp,
  readInput
};

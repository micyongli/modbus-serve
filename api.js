const pug = require("pug");
const path = require("path");
const Route = require("koa-router");
const debug = require("debug")("modbus:http");
const {
  requestHoldReadBE,
  requestInputReadBE,
  requestHoldWriteBE
} = require("./device");

debug.enabled = true;

const R = new Route();

R.post("/api/rtu_read", async ctx => {
  debug(ctx.request.body);

  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "not authorization"
    };
    return;
  }

  const { devId, devAddress, register, count } = ctx.request.body;
  const r = /[0-9]+/;
  if (!devId || !r.test(devAddress) || !r.test(register) || !r.test(count)) {
    ctx.body = {
      code: -1,
      message: "request params has error"
    };
    return;
  }

  await new Promise((resolve, reject) => {
    requestReadBE(devId, devAddress, register, count, (state, obj) => {
      switch (state) {
        case "offline":
          {
            ctx.body = {
              code: -1,
              message: "offline"
            };
            resolve();
          }
          break;
        case "start":
          {
            debug("task start ");
          }
          break;
        case "completed":
          {
            ctx.body = {
              code: 0,
              message: "completed",
              data: obj["data"]
            };
            resolve();
          }
          break;
        case "timeout":
          {
            ctx.body = {
              code: -1,
              message: "timeout"
            };
            resolve();
          }
          break;
        default: {
          ctx.body = {
            code: -1,
            message: "unknown error"
          };
          resolve();
        }
      }
    });
  });
});

function validAuthorization(pass) {
  return (
    ["1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2"]
      .map(v => `Bearer ${v}`)
      .indexOf(pass) >= 0
  );
}

R.post("/api/rtu_write", async ctx => {
  debug(ctx.request.body);
  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "no authorization"
    };
    return;
  }
  let { devId, devAddress, register, count, data } = ctx.request.body;
  const r = /[0-9]+/;
  if (
    !devId ||
    !r.test(devAddress) ||
    !r.test(register) ||
    !r.test(count) ||
    !Array.isArray(data)
  ) {
    ctx.body = {
      code: -1,
      message: "request params has error"
    };
    return;
  }

  await new Promise((resolve, reject) => {
    requestWriteBE(devId, devAddress, register, count, data, (state, obj) => {
      switch (state) {
        case "offline":
          {
            ctx.body = {
              code: -1,
              message: "offline"
            };
            resolve();
          }
          break;
        case "start":
          {
            debug("task start ");
          }
          break;
        case "completed":
          {
            ctx.body = {
              code: 0,
              message: "completed",
              data: obj["data"]
            };
            resolve();
          }
          break;
        case "timeout":
          {
            ctx.body = {
              code: -1,
              message: "timeout"
            };
            resolve();
          }
          break;
        default: {
          ctx.body = {
            code: -1,
            message: "unknown error"
          };
          resolve();
        }
      }
    });
  });
});

async function read(reader, devId, devAdd, register, regCount, dataType) {
  let num = 1;
  switch (dataType) {
    case 2:
    case 1:
      num = 2;
  }
  num *= regCount;

  return await new Promise((resolve, reject) => {
    reader(devId, devAdd, register, num, (state, obj) => {
      switch (state) {
        case "offline":
          {
            resolve({ desc: "offline" });
          }
          break;
        case "start":
          {
          }
          break;
        case "completed":
          {
            const dt = obj["data"]["data"];

            let numBuffer = Buffer.alloc(4);
            let resultValue = [];
            switch (dataType) {
              case 0:
                resultValue = dt.map(v => v);
                break;
              case 1: {
                const c = regCount;
                for (let i = 0; i < c; i++) {
                  numBuffer.writeUInt16BE(dt[i * 2], 0);
                  numBuffer.writeUInt16BE(dt[i * 2 + 1], 2);
                  resultValue.push(numBuffer.readUInt32BE(0));
                }
                break;
              }
              case 2: {
                const c = regCount;
                for (let i = 0; i < c; i++) {
                  numBuffer.writeUInt16BE(dt[i * 2], 0);
                  numBuffer.writeUInt16BE(dt[i * 2 + 1], 2);
                  resultValue.push(numBuffer.readFloatBE(0));
                }
                break;
              }
            }
            resolve({ desc: "completed", value: resultValue });
          }
          break;
        case "timeout":
          {
            resolve({ desc: "timeout" });
          }
          break;
        default: {
          resolve({ desc: "error" });
        }
      }
    });
  });
}

async function write(devId, devAdd, modIndex, dataType, value) {
  let regCount = 1;
  switch (dataType) {
    case 2:
    case 1:
      regCount = 2;
  }

  let numBuffer;
  switch (dataType) {
    case 0:
      numBuffer = Buffer.alloc(2);
      numBuffer.writeUInt16BE(value);
      break;
    case 1:
      numBuffer = Buffer.alloc(4);
      numBuffer.writeUInt32BE(value);
      break;
    case 2:
      numBuffer = Buffer.alloc(4);
      numBuffer.writeFloatBE(value);
      break;
  }

  return await new Promise((resolve, reject) => {
    requestWriteBE(
      devId,
      devAdd,
      modIndex,
      regCount,
      numBuffer,
      (state, obj) => {
        switch (state) {
          case "offline":
            {
              resolve({ desc: "offline" });
            }
            break;
          case "start":
            {
              debug("task start ");
            }
            break;
          case "completed":
            {
              resolve({ desc: "completed" });
            }
            break;
          case "timeout":
            {
              resolve({ desc: "timeout" });
            }
            break;
          default: {
            resolve({ desc: "error" });
          }
        }
      }
    );
  });
}

R.post("/api/read_hold_float", async ctx => {
  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "not authorization"
    };
    return;
  }

  let { dev_id, bus_id, reg, reg_count } = ctx.request.body;

  bus_id = parseInt(bus_id);
  reg = parseInt(reg);
  reg_count = parseInt(reg_count);

  const err = {
    code: -1,
    message: "参数异常"
  };

  if (
    !Number.isInteger(bus_id) ||
    !Number.isInteger(reg) ||
    !Number.isInteger(reg_count) ||
    !dev_id
  ) {
    ctx.body = err;
    return;
  }

  const result = await read(
    requestHoldReadBE,
    dev_id,
    bus_id,
    reg,
    reg_count,
    2
  );
  const { desc } = result;
  switch (desc) {
    case "completed": {
      ctx.body = {
        code: 0,
        data: result["value"]
      };
      return;
    }
    default: {
      ctx.body = { code: -1, msg: desc };
    }
  }
});

R.post("/api/read_input_float", async ctx => {
  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "not authorization"
    };
    return;
  }

  let { dev_id, bus_id, reg, reg_count } = ctx.request.body;

  bus_id = parseInt(bus_id);
  reg = parseInt(reg);
  reg_count = parseInt(reg_count);

  const err = {
    code: -1,
    message: "参数异常"
  };

  if (
    !Number.isInteger(bus_id) ||
    !Number.isInteger(reg) ||
    !Number.isInteger(reg_count) ||
    !dev_id
  ) {
    ctx.body = err;
    return;
  }

  const result = await read(
    requestInputReadBE,
    dev_id,
    bus_id,
    reg,
    reg_count,
    2
  );

  const { desc } = result;
  switch (desc) {
    case "completed": {
      ctx.body = {
        code: 0,
        data: result["value"]
      };
      return;
    }
    default: {
      ctx.body = { code: -1, msg: desc };
    }
  }
});

R.post("/api/read_input_int32", async ctx => {
  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "not authorization"
    };
    return;
  }

  let { dev_id, bus_id, reg, reg_count } = ctx.request.body;

  bus_id = parseInt(bus_id);
  reg = parseInt(reg);
  reg_count = parseInt(reg_count);

  const err = {
    code: -1,
    message: "参数异常"
  };

  if (
    !Number.isInteger(bus_id) ||
    !Number.isInteger(reg) ||
    !Number.isInteger(reg_count) ||
    !dev_id
  ) {
    ctx.body = err;
    return;
  }

  const result = await read(
    requestInputReadBE,
    dev_id,
    bus_id,
    reg,
    reg_count,
    1
  );

  const { desc } = result;
  switch (desc) {
    case "completed": {
      ctx.body = {
        code: 0,
        data: result["value"]
      };
      return;
    }
    default: {
      ctx.body = { code: -1, msg: desc };
    }
  }
});

R.post("/api/read_input_int16", async ctx => {
  if (!validAuthorization(ctx.header["authorization"])) {
    ctx.body = {
      code: -1,
      message: "not authorization"
    };
    return;
  }

  let { dev_id, bus_id, reg, reg_count } = ctx.request.body;

  bus_id = parseInt(bus_id);
  reg = parseInt(reg);
  reg_count = parseInt(reg_count);

  const err = {
    code: -1,
    message: "参数异常"
  };

  if (
    !Number.isInteger(bus_id) ||
    !Number.isInteger(reg) ||
    !Number.isInteger(reg_count) ||
    !dev_id
  ) {
    ctx.body = err;
    return;
  }

  const result = await read(
    requestInputReadBE,
    dev_id,
    bus_id,
    reg,
    reg_count,
    0
  );

  const { desc } = result;
  switch (desc) {
    case "completed": {
      ctx.body = {
        code: 0,
        data: result["value"]
      };
      return;
    }
    default: {
      ctx.body = { code: -1, msg: desc };
    }
  }
});



module.exports = exports = function(app) {
  app.use(R.routes());
};

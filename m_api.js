const pug = require("pug");
const path = require("path");
const Route = require("koa-router");
const debug = require("debug")("modbus:http");
const db = require("./db");

debug.enabled = true;

const reloader = require("./reloader");

const { deviceOnline } = require("./device");

const {
  requestHoldReadBE,
  requestInputReadBE,
  requestWriteBE
} = require("./device");

const R = new Route();

function isString(v) {
  return Object.prototype.toString.call(v) === "[object String]";
}

function isIntStr(v) {
  return /^[0-9]*$/.test(v);
}

R.get(["/", "/h", /\/h\/.*/], ctx => {
  ctx.body = pug.renderFile(path.resolve(__dirname, "./views/index.pug"));
});

R.get("/api/dtu", async ctx => {
  let { rows, page } = ctx.query;

  rows = parseInt(rows);
  page = parseInt(page);
  debug(rows, page);
  let conn;
  await db
    .getConnectionAsync()
    .then(c => (conn = c))
    .then(() => {
      return conn.queryAsync(
        "select ceil(count(*)/5) as page,count(*) as count from devices"
      );
    })
    .then(x => {
      return conn
        .queryAsync(
          'select device_id,device_desc,date_format(create_time,"%Y-%m-%d %H:%i:%s") as create_time from devices order by create_time limit ?,?',
          [rows * page, rows]
        )
        .then(v => {
          return {
            ...x[0],
            data: v.map(xx => {
              const obj = {};
              for (let ky in xx) {
                obj[ky] = void 0;
                if (xx[ky] !== null) obj[ky] = `${xx[ky]}`;
              }
              obj["online"] = deviceOnline(obj["device_id"]);
              return obj;
            })
          };
        });
    })
    .then(v => {
      ctx.body = v;
    })
    .catch(e => {
      ctx.status = 300;
      ctx.body = {
        message: e.message
      };
    })
    .finally(() => {
      if (conn) {
        db.releaseConnection(conn);
      }
    });
});

R.post("/api/dtu", async ctx => {
  const { device_id, device_desc } = ctx.request.body;
  if (typeof device_id === "undefined" || typeof device_desc === "undefined") {
    ctx.status = 400;
    ctx.body = {
      message: "request id is empty"
    };
    return;
  }
  let conn;
  await db
    .getConnectionAsync()
    .then(c => {
      conn = c;
      return c;
    })
    .then(v => {
      return v.beginTransactionAsync();
    })
    .then(v => {
      return conn.queryAsync(
        "select * from devices where device_id=? limit 1",
        [device_id]
      );
    })
    .then(v => {
      if (v.length > 0) {
        ctx.status = 400;
        ctx.body = {
          message: "hava same record"
        };
        return;
      }
      ctx.status = 200;
      return conn.queryAsync(
        "insert into devices(device_id,device_desc) values(?,?) ",
        [device_id, device_desc]
      );
    })
    .then(v => {
      return conn.commitAsync();
    })
    .then(() => {
      if (ctx.status === 200) reloader.emit("reload");
    })
    .catch(e => {
      ctx.status = 400;
      ctx.body = {
        message: e.message
      };
      return conn.rollbackAsync();
    })
    .finally(() => {
      if (conn) {
        db.releaseConnection(conn);
      }
    });
});

R.delete("/api/dtu", async ctx => {
  const { id } = ctx.request.body;
  if (typeof id === "undefined") {
    ctx.status = 400;
    ctx.body = {
      message: "request id is empty"
    };
    return;
  }
  let conn;
  await db
    .getConnectionAsync()
    .then(c => (conn = c))
    .then(() => conn.beginTransactionAsync())
    .then(() => {
      return conn.queryAsync(
        "select device_id from devices where device_id=? limit 1",
        [id]
      );
    })
    .then(v => {
      if (v.length === 0) {
        ctx.status = 400;
        return;
      }
      return conn.queryAsync("delete from devices where device_id=?", [id]);
    })
    .then(r => {
      ctx.status = 200;
      return conn.commitAsync();
    })
    .then(() => {
      if (ctx.status === 200) reloader.emit("reload");
    })
    .catch(e => {
      ctx.status = 400;
      return conn.rollbackAsync();
    })
    .finally(() => {
      if (conn) {
        db.releaseConnection(conn);
      }
    });
});

R.put("/api/dtu", async ctx => {
  const { old_device_id, device_id, device_desc } = ctx.request.body;
  if (
    typeof old_device_id === "undefined" ||
    typeof device_id === "undefined"
  ) {
    ctx.status = 400;
    ctx.body = {
      message: "request id is empty"
    };
    return;
  }
  let conn;
  await db
    .getConnectionAsync()
    .then(c => (conn = c))
    .then(() => conn.beginTransactionAsync())
    .then(() => {
      return conn.queryAsync(
        "select device_id from devices where device_id=? limit 1",
        [old_device_id]
      );
    })
    .then(v => {
      if (v.length === 0) {
        ctx.status = 400;
        return;
      }
      return conn.queryAsync(
        "update  devices set device_id=?,device_desc=? where device_id=?",
        [device_id, device_desc, old_device_id]
      );
    })
    .then(r => {
      ctx.status = 200;
      return conn.commitAsync();
    })
    .then(() => {
      if (ctx.status === 200) reloader.emit("reload");
    })
    .catch(e => {
      ctx.status = 400;
      return conn.rollbackAsync();
    })
    .finally(() => {
      if (conn) {
        db.releaseConnection(conn);
      }
    });
});

R.post("/api/tester", async ctx => {
  let {
    dataType,
    opType,
    register,
    alph,
    devAdd,
    value,
    dev,
    regType
  } = ctx.request.body;

  console.log(ctx.request.body);
  isIntStr(opType) && (opType = parseInt(opType));
  isIntStr(dataType) && (dataType = parseInt(dataType));
  isIntStr(register) && (register = parseInt(register));
  isIntStr(devAdd) && (devAdd = parseInt(devAdd));
  isIntStr(regType) && (regType = parseInt(regType));
  alph = parseFloat(alph);

  const err = {
    code: -1,
    message: "参数异常"
  };

  if (
    typeof dev === "undefined" ||
    typeof dev["device_id"] === "undefined" ||
    typeof dataType !== "number" ||
    typeof opType !== "number" ||
    typeof register !== "number" ||
    typeof alph !== "number" ||
    typeof devAdd !== "number" ||
    alph !== alph
  ) {
    ctx.body = err;
    return;
  }

  if (opType === 1) {
    switch (dataType) {
      case 0:
      case 1:
        value = parseInt(value);
        break;
      case 2:
        value = parseFloat(value);
        break;
    }
    if (typeof value !== "number" || value !== value) {
      ctx.body = err;
      return;
    }
  }

  let count = 1;
  if (dataType > 0) {
    count++;
  }

  const devId = dev["device_id"];

  const exe = regType === 0 ? requestHoldReadBE : requestInputReadBE;

  if (opType === 0) {
    await new Promise((resolve, reject) => {
      exe(devId, devAdd, register, count, (state, obj) => {
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
              const dt = obj["data"]["data"];

              let numBuffer = Buffer.alloc(4);
              let resultValue = 0;
              switch (dataType) {
                case 0:
                  resultValue = dt[0];
                  break;
                case 1:
                  numBuffer.writeUInt16BE(dt[0], 0);
                  numBuffer.writeUInt16BE(dt[1], 2);
                  resultValue = numBuffer.readUInt32BE(0);
                  break;
                case 2:
                  numBuffer.writeUInt16BE(dt[0], 0);
                  numBuffer.writeUInt16BE(dt[1], 2);
                  resultValue = numBuffer.readFloatBE(0);
                  break;
              }

              ctx.body = {
                code: 0,
                message: "completed",
                data: [resultValue]
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
  } else if (opType === 1) {
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

    await new Promise((resolve, reject) => {
      requestHoldWriteBE(
        devId,
        devAdd,
        register,
        count,
        numBuffer,
        (state, obj) => {
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
        }
      );
    });
  } else {
    ctx.body = err;
  }
});

R.get("/api/user", ctx => {
  ctx.body = ctx.session.userInfo;
});

R.get("/api/dtu_log", async ctx => {
  let conn;
  await db
    .getConnectionAsync()
    .then(c => (conn = c))
    .then(() => {
      return conn.queryAsync(
        'select device_id,date_format(create_time,"%Y-%m-%d %H:%i:%s") as create_time from device_line_log  order by create_time desc'
      );
    })
    .then(v => {
      ctx.body = v.map(v => {
        return {
          device_id: v["device_id"].toString(),
          create_time: v["create_time"].toString()
        };
      });
    })
    .catch(e => {
      ctx.status = 300;
      ctx.body = {
        message: e.message
      };
    })
    .finally(() => {
      if (conn) {
        db.releaseConnection(conn);
      }
    });
});

module.exports = exports = function(app) {
  app.use(R.routes());
};

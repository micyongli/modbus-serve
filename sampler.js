const {
  requestHoldReadBE,
  requestInputReadBE,
  requestHoldWriteBE
} = require("./device");

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

async function read_input(devId, devAdd, register, regCount, dataType) {
  return await read(
    requestInputReadBE,
    devId,
    devAdd,
    register,
    regCount,
    dataType
  );
}

async function read_input_float(devId, devAdd, register, regCount) {
  return await read_input(devId, devAdd, register, regCount, 2);
}

const mg = require("mongodb").MongoClient;

mg.connect("mongodb://localhost:27017", { useNewUrlParser: true }).then(c => {
  c.close();
});

// setInterval(async () => {
//   [{ id: "P401B2190415058", addr: 2 }].forEach(async v => {
//     const { id, addr } = v;
//     const result = await read_input_float(id, addr, 4112, 3);
//     if (result["desc"] === "completed") {
//       const client = await mg.connect("mongodb://localhost:27017", {
//         useNewUrlParser: true
//       });
//       const record = client.db("sampler").collection("rec");
//       await record.insertOne({
//         id,
//         addr,
//         timestamp: Date.now(),
//         result
//       });
//       client.close();
//     }
//     {
//     }
//   });
// }, 5000);

const debug = require("debug")("modbus:http");

debug.enabled = true;
const config = require("./config");
const session = require("koa-session");

const md5 = require("md5");
const db = require("./db");
const pug = require("pug");
const port = config.http.port;
const path = require("path");
const koa = require("koa");
const S = require("koa-static-cache");
const body = require("koa-bodyparser");

const app = new koa();
app.keys = ["xXx xXx xXx xXx xXx xXx"];

const sessionConfig = {
  key: "m_rtu:session",
  maxAge: 0,
  autoCommit: true,
  overwrite: false,
  httpOnly: true,
  signed: false,
  rolling: false,
  renew: true
};

app.use(body());

app.use(
  new S(path.resolve(__dirname, "./public"), { maxAge: 1 * 24 * 60 * 60 })
);

require("./api")(app);

app.use(session(sessionConfig, app));

app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (["/do", "/login", "/logout"].indexOf(rpath) >= 0) {
    switch (rpath) {
      case "/do": {
        const { user, pwd } = ctx.request.body;
        if (!user || !pwd) {
          ctx.body = {
            code: -1,
            message: "params has errors"
          };
          return;
        }
        await new Promise((resolve, reject) => {
          let conn;
          db.getConnectionAsync()
            .then(c => (conn = c))
            .then(() => conn.beginTransactionAsync())
            .then(() => {
              return conn.queryAsync(
                "select * from users where user_id=? and user_password=? limit 1",
                [user, md5(pwd)]
              );
            })
            .then(v => {
              if (v.length === 1) {
                ctx.body = {
                  code: 0,
                  message: "success"
                };
                ctx.session.isLogin = true;
                const u = v[0];
                delete u["user_password"];
                ctx.session.userInfo = u;
                return conn.queryAsync(
                  "update users set last_login_time=now() where user_id=?",
                  [u["user_id"]]
                );
              } else {
                ctx.session.isLogin = false;

                ctx.body = {
                  code: -1,
                  message: "user or password has error"
                };
              }
            })
            .then(() => {
              resolve();
              return conn.commitAsync();
            })
            .catch(e => {
              ctx.body = {
                code: -1,
                message: e.message
              };
              resolve();
              return conn.rollbackAsync();
            })
            .finally(() => {
              if (conn) {
                db.releaseConnection(conn);
              }
            });
        });
        return;
      }
      case "/login": {
        if (ctx.session.isLogin) {
          ctx.redirect("/");
          return;
        }
        ctx.body = pug.renderFile(path.resolve(__dirname, "views/index.pug"));
        return;
      }
    }
  }

  if (!ctx.session.isLogin) {
    ctx.redirect("/login");
    return;
  }

  await next();
});

require("./m_api")(app);

app.listen(port, () => {
  debug(`listen at ${port}`);
});

require("./modbusServe");

require('./sampler')
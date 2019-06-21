const Q = require('./rQueue');

const debug = require('debug')('q:test');
debug.enabled = true;

const q1 = new Q(5000);
q1.en(
    { dev: '1' },
    ctx => {
        console.log(new Date(), 'start', ctx);
        q1.en(
            { dev: '2' },
            ctx => {
                console.log(new Date(), 'start', ctx);

            },
            (ctx, data) => {
                console.log(new Date(), 'stop', ctx, data)
            },
            ctx => {
                console.log(new Date(), 'timeout', ctx);
            }
        );
        q1.en(
            { dev: '3' },
            ctx => {
                console.log(new Date(), 'start', ctx);
                setTimeout(() => {
                    q1.completed({ code: 0, msg: 'this is task1' });
                })
            },
            (ctx, data) => {
                console.log(new Date(), 'stop', ctx, data)
            },
            ctx => {
                console.log(new Date(), 'timeout', ctx);
            }
        );
        setTimeout(() => {
            q1.completed({ code: 0, msg: 'this is task1' });
        })
    },
    (ctx, data) => {
        console.log(new Date(), 'stop', ctx, data)
    },
    ctx => {
        console.log(new Date(), 'timeout', ctx);
    }
);
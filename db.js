const bluebird = require('bluebird');

let mysql = require('mysql');
bluebird.promisifyAll(mysql);
bluebird.promisifyAll(require('mysql/lib/Pool').prototype);
bluebird.promisifyAll(require('mysql/lib/Connection').prototype);

const config = require('./config')['db'];
const newConfig = Object.assign({
    acquireTimeout: 3000,
    connectionLimit: 5,
    debug: false,
    trace: false
}, config);

const pool = mysql.createPool(newConfig);

module.exports = exports = {
    
    getConnectionAsync: () => {
        return pool.getConnectionAsync();
    },
    releaseConnection: c => {
        pool.releaseConnection(c);
    }
};
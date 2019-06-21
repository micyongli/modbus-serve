const EventEmitter = require('events').EventEmitter;

class Reloader extends EventEmitter {
    constructor() {
        super()
    }
}

const reloader = new Reloader();

module.exports = reloader;
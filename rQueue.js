//工作原理：
//队列为空，放入新任务，启动任务，等待任务完成，超时、完成则弹出，继续下一任务
//

class rQueue {

    constructor(timeout) {
        this.Q = [];
        this.timeout = timeout;
        this.timer = null;

    }

    count() {
        return this.Q.length;
    }

    completed(data) {
        this.stopTimer();
        const top = this.un();
        if (!top) {
            return false;
        }
        const { stop, content } = top;
        this.next();
        setImmediate(() => {
            stop(content, data);
        });
        return true;
    }

    en(content, start, stop, timeout) {
        const beforeLen = this.Q.length;
        this.Q.push({ content, start, stop, timeout });
        if (beforeLen === 0) {
            start(content);
            this.startTimer();
        }
    }

    un() {
        return this.Q.shift();
    }

    next() {
        if (this.count() > 0) {
            setImmediate(() => {
                const { content, start } = this.Q[0];
                start(content);
                this.startTimer();
            });
        }
    }


    startTimer() {
        this.timer = setTimeout(() => {
            this.stopTimer();
            const top = this.un();
            const { timeout, content } = top;
            timeout(content);
            this.next();

        }, this.timeout);
    }

    stopTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

}

module.exports = exports = rQueue;
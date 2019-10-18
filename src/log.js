const VERBOSE = 0;
const DEBUG = 1;
const INFO = 2;
const WARN = 3;
const ERROR = 4;

let logLevel = INFO;

function config(level) {
    logLevel = level;
}

function baseLog(level, msg) {
    if (level < logLevel) {
        return
    }
    if (level >= DEBUG) {
        let dateString = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\./, ' ')
            .replace(/Z/, 'ms');
        return console.log(dateString, msg);
    } else {
        return console.log(msg);
    }
}

function verbose(msg) {
    return baseLog(VERBOSE, msg);
}

function debug(msg) {
    return baseLog(DEBUG, msg);
}

function info(msg) {
    return baseLog(INFO, msg);
}

function warn(msg) {
    return baseLog(WARN, msg);
}

function error(msg) {
    return baseLog(ERROR, (msg != null ? msg.stack : void 0) || msg);
}

module.exports = {
    config, verbose, debug, info, warn, error, VERBOSE, DEBUG, INFO, WARN, ERROR
};

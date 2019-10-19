const VERBOSE = 0;
const DEBUG = 1;
const INFO = 2;
const WARN = 3;
const ERROR = 4;

let logLevel = VERBOSE;

function config(level: number) {
    logLevel = level;
}

function baseLog(level: number, msg: any) {
    if (level < logLevel) {
        return
    }
    if (level >= DEBUG) {
        let dateString = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\./, ' ')
            .replace(/Z/, 'ms');
        return console.log(dateString, ":", msg);
    } else {
        return console.log(msg);
    }
}

function verbose(msg: any) {
    return baseLog(VERBOSE, "VERBOSE - " + msg);
}

function debug(msg: any) {
    return baseLog(DEBUG, "DEBUG - " + msg);
}

function info(msg: any) {
    return baseLog(INFO, "INFO - " + msg);
}

function warn(msg: any) {
    return baseLog(WARN, "WARN - " + msg);
}

function error(msg: any) {
    return baseLog(ERROR, "ERROR - " + msg);
}

module.exports = {
    config, verbose, debug, info, warn, error
};

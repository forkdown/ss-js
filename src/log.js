"use strict";
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
    let dateString = new Date().toISOString()
        .replace(/T/, ' ')
        .replace(/\./, ' ')
        .replace(/Z/, 'ms');
    if (level < logLevel) {
        return;
    }
    if (level === ERROR) {
        console.log("\x1b[91m", dateString, ":", msg);
        return;
    }
    if (level >= DEBUG) {
        let dateString = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\./, ' ')
            .replace(/Z/, 'ms');
        console.log("\x1b[97m", dateString, ":", msg);
    }
    else {
        console.log("\x1b[96m", dateString, ":", msg);
    }
}
function verbose(msg) {
    return baseLog(VERBOSE, "VERBOSE - " + msg);
}
function debug(msg) {
    return baseLog(DEBUG, "DEBUG   - " + msg);
}
function info(msg) {
    return baseLog(INFO, "INFO    - " + msg);
}
function warn(msg) {
    return baseLog(WARN, "WARN    - " + msg);
}
function error(msg) {
    return baseLog(ERROR, "ERROR   - " + msg);
}
module.exports = {
    config, verbose, debug, info, warn, error,
    VERBOSE, DEBUG, INFO, WARN, ERROR
};
//# sourceMappingURL=log.js.map
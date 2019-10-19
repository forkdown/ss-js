"use strict";
var VERBOSE = 0;
var DEBUG = 1;
var INFO = 2;
var WARN = 3;
var ERROR = 4;
var logLevel = INFO;
function config(level) {
    logLevel = level;
}
function baseLog(level, msg) {
    if (level < logLevel) {
        return;
    }
    if (level >= DEBUG) {
        var dateString = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\./, ' ')
            .replace(/Z/, 'ms');
        return console.log(dateString, ":", msg);
    }
    else {
        return console.log(msg);
    }
}
function verbose(msg) {
    return baseLog(VERBOSE, "VERBOSE - " + msg);
}
function debug(msg) {
    return baseLog(DEBUG, "DEBUG - " + msg);
}
function info(msg) {
    return baseLog(INFO, "INFO - " + msg);
}
function warn(msg) {
    return baseLog(WARN, "WARN - " + msg);
}
function error(msg) {
    return baseLog(ERROR, "ERROR - " + msg);
}
module.exports = {
    config: config, verbose: verbose, debug: debug, info: info, warn: warn, error: error
};
//# sourceMappingURL=log.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var log = require("./log");
var configFileName = "ssconfig.json";
var Config = /** @class */ (function () {
    function Config() {
        this.server = "0.0.0.0";
        this.servers = [];
        this.server_port = 8388;
        this.password = "foobar";
        this.port_password = {};
        this.method = "aes-256-cfb";
        this.config_file = "ssconfig.json";
        this.timeout = 6;
        this.verbose = false;
    }
    return Config;
}());
function printLocalHelp() {
    console.log("\nCommand: ss-local\n\n" +
        "  -h, --help            show this help message and exit\n" +
        "  -b LOCAL_ADDR         local binding address, default is 127.0.0.1\n" +
        "  -l LOCAL_PORT         local port");
    console.log("\n" +
        "  -s SERVER_ADDR        server address\n" +
        "  -p SERVER_PORT        server port\n" +
        "  -k PASSWORD           password\n" +
        "  -m METHOD             encryption method, for example, aes-256-cfb\n" +
        "  -t TIMEOUT            timeout in seconds\n" +
        "  -c CONFIG             path to config file");
}
function printServerHelp() {
    console.log("\nCommand: ss-server\n\n" +
        "  -h, --help            show this help message and exit\n" +
        "  -s SERVER_ADDR        server address\n" +
        "  -p SERVER_PORT        server port\n" +
        "  -k PASSWORD           password\n" +
        "  -m METHOD             encryption method, for example, aes-256-cfb\n" +
        "  -t TIMEOUT            timeout in seconds\n" +
        "  -c CONFIG             path to config file");
}
function findConfigPath(configPath) {
    //先查根目录
    if (fs.existsSync(configPath)) {
        return configPath;
    }
    //在查跟当前代码平级的目录
    configPath = path.resolve(__dirname, configFileName);
    if (fs.existsSync(configPath)) {
        return configPath;
    }
    //再查上级目录
    configPath = path.resolve(__dirname, "../" + configFileName);
    if (fs.existsSync(configPath)) {
        return configPath;
    }
    log.error('There is no config.json found');
    process.exit(1);
    return "";
}
function checkConfigFile(configPath) {
    var config = new Config();
    if (configPath === "") {
        return config;
    }
    log.info('loading config from file: ' + configPath);
    var configContent = fs.readFileSync(configPath);
    try {
        var configJson = JSON.parse(configContent.toString("utf8"));
        Object.assign(config, configJson);
        return config;
    }
    catch (e) {
        log.error('found an error in ' + configPath + " : " + e.message);
        process.exit(1);
        return config;
    }
}
function checkConfig(config) {
    if (config.server === '127.0.0.1' || config.server === 'localhost') {
        log.warn("Server is set to " + config.server + ", maybe it's not correct");
        log.warn("Notice server will listen at " + config.server + ":" + config['server_port']);
    }
    if ((config.method || '').toLowerCase() === 'rc4') {
        log.warn('RC4 is not safe; please use a safer cipher, like AES-256-CFB');
    }
}
function parseArgs(isServer) {
    if (isServer === void 0) { isServer = false; }
    var argv = process.argv;
    var definition = {
        "-l": 'local_port',
        "-p": 'server_port',
        "-s": 'server',
        '-k': 'password',
        '-c': 'config_file',
        '-m': 'method',
        '-b': 'local_address',
        '-t': 'timeout'
    };
    var config = {};
    var nextIsValue = false;
    var lastKey = "";
    var configRet = new Config();
    argv.forEach(function (item) {
        if (nextIsValue) {
            config[lastKey] = item;
            nextIsValue = false;
        }
        else if (definition[item]) {
            definition.lastKey = definition[item];
            nextIsValue = true;
        }
        else if ('-v' === item) {
            config['verbose'] = true;
        }
        else if (item.indexOf('-') === 0) {
            if (isServer) {
                printServerHelp();
            }
            else {
                printLocalHelp();
            }
            process.exit(2);
        }
    });
    Object.assign(configRet, config);
    return config;
}
function transform(config) {
    var len = Object.keys(config.port_password).length;
    if (len > 0 && (config['server_port'] || config['password'])) {
        log.warn('warning: if had port_password , server_port and password will be ignored');
    }
    if (len == 0) {
        var port = config['server_port'].toString();
        config.port_password[port] = config['password'];
    }
    if (config.servers.length === 0) {
        config.servers = [config['server']];
    }
    return config;
}
/**
 * 重要函数
 */
function getConfig(configFileName, isServer) {
    var configPath = findConfigPath(configFileName);
    var configFromArgs = parseArgs(isServer);
    if (configFromArgs['config_file']) {
        configPath = configFromArgs['config_file'];
    }
    var config = checkConfigFile(configPath);
    Object.assign(config, configFromArgs);
    checkConfig(config);
    config = transform(config);
    afterProcess(config);
    return config;
}
function afterProcess(config) {
    if (config.verbose) {
        log.config(log.DEBUG);
    }
}
function getServerConfig() {
    return getConfig(configFileName, true);
}
function getServerExpandedConfigArray() {
    var config = getServerConfig();
    var expandedConfigArray = [];
    if (config.timeout == null) {
        config.timeout = 600;
    }
    var timeout = Math.floor(config.timeout * 1000) || 300000;
    if (config.port_password == null) {
        return [];
    }
    Object.keys(config.port_password).forEach(function (port) {
        if (config.port_password == null) {
            return [];
        }
        var password = config['port_password'][port];
        if (config.servers == null) {
            return expandedConfigArray;
        }
        config['servers'].forEach(function (server_ip) {
            var expandedConfig = {
                timeout: timeout,
                password: password,
                port: parseInt(port),
                method: config['method'],
                server_ip: server_ip,
            };
            expandedConfigArray.push(expandedConfig);
        });
    });
    return expandedConfigArray;
}
module.exports = {
    getServerExpandedConfigArray: getServerExpandedConfigArray
};
//# sourceMappingURL=configLib.js.map
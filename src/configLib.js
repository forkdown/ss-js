const utils = require("./utils");
const fs = require("fs");
const path = require("path");

const configFileName = "config.json";

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
    utils.error('There is no config.json found');
    process.exit(1);
}

function checkConfigFile(configPath) {
    if (!configPath) {
        return {};
    }
    utils.info('loading config from ' + configPath);
    let configContent = fs.readFileSync(configPath);
    try {
        return JSON.parse(configContent.toString("utf8"));
    } catch (e) {
        utils.error('found an error in config.json: ' + e.message);
        process.exit(1);
    }
}

function checkConfig(config) {
    if (!(config['server'] && (config['server_port'] || config['port_password']) && config['password'])) {
        utils.warn('config.json not found, you have to specify all config in commandline');
        process.exit(1);
    }

    if (config.server === '127.0.0.1' || config.server === 'localhost') {
        utils.warn("Server is set to " + config.server + ", maybe it's not correct");
        utils.warn("Notice server will listen at " + config.server + ":" + config.server_port);
    }
    if ((config.method || '').toLowerCase() === 'rc4') {
        return utils.warn('RC4 is not safe; please use a safer cipher, like AES-256-CFB');
    }
}

function getConfig(configFileName, isServer) {
    let configPath = findConfigPath(configFileName);
    let configFromArgs = utils.parseArgs(isServer);
    if (configFromArgs['config_file']) {
        configPath = configFromArgs['config_file'];
    }
    let config = checkConfigFile(configPath);
    Object.assign(config, configFromArgs);
    checkConfig(config);
    afterProcess(config);
    return config;
}

function afterProcess(config) {
    if (config.verbose) {
        utils.config(utils.DEBUG);
    }
}

function getServerConfig() {
    return getConfig(configFileName, true);
}

module.exports = {
    getServerConfig,
};

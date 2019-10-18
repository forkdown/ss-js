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

function getConfig(configFileName, isServer) {
    let configPath = findConfigPath(configFileName);
    let configFromArgs = utils.parseArgs(isServer);
    if (configFromArgs['config_file']) {
        configPath = configFromArgs['config_file'];
    }
    let config = checkConfigFile(configPath);
    Object.assign(config, configFromArgs);
    utils.checkConfig(config);
    afterConfig(config);
    return config;
}

function afterConfig(config) {
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

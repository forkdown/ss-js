const fs = require("fs");
const path = require("path");
const log = require("./log");

const configFileName = "ssconfig.json";

class Config {
    server: string = "0.0.0.0";
    servers: string[] = [];
    server_port: number = 8388;
    password: string = "foobar";
    port_password: any = {};
    method: string = "aes-256-cfb";
    config_file: string = "ssconfig.json";
    timeout: number = 6;
    verbose: boolean = false;
}

export interface ExpandedConfig {
    port: number
    password: string
    server_ip: string
    method: string
    timeout: number
}

function printLocalHelp(): void {
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

function printServerHelp(): void {
    console.log("\nCommand: ss-server\n\n" +
        "  -h, --help            show this help message and exit\n" +
        "  -s SERVER_ADDR        server address\n" +
        "  -p SERVER_PORT        server port\n" +
        "  -k PASSWORD           password\n" +
        "  -m METHOD             encryption method, for example, aes-256-cfb\n" +
        "  -t TIMEOUT            timeout in seconds\n" +
        "  -c CONFIG             path to config file");
}

function findConfigPath(configPath: string): string {
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
    return ""
}


function checkConfigPath(configPath: string): Config {
    let config = new Config();
    if (configPath === "") {
        return config;
    }
    log.info('loading config from file: ' + configPath);
    let configContent = fs.readFileSync(configPath);
    try {
        let configJson = JSON.parse(configContent.toString("utf8"));
        Object.assign(config, configJson);
        return config;
    } catch (e) {
        log.error('found an error in ' + configPath + " : " + e.message);
        process.exit(1);
        return config
    }
}

function checkConfig(config: Config): boolean {
    if (config.server === '127.0.0.1' || config.server === 'localhost') {
        log.warn("Server is set to " + config.server + ", maybe it's not correct");
        log.warn("Notice server will listen at " + config.server + ":" + config['server_port']);
    }
    if ((config.method || '').toLowerCase() === 'rc4') {
        log.warn('RC4 is not safe; please use a safer cipher, like AES-256-CFB');
    }
    return true;
}

function parseArgs(isServer = false): Config {
    let argv = process.argv;
    let definition: any = {
        "-l": 'local_port',
        "-p": 'server_port',
        "-s": 'server',
        '-k': 'password',
        '-c': 'config_file',
        '-m': 'method',
        '-b': 'local_address',
        '-t': 'timeout'
    };
    let config: any = {};
    let nextIsValue = false;
    let lastKey: string = "";
    let configRet = new Config();

    argv.forEach(item => {
        if (nextIsValue) {
            config[lastKey] = item;
            nextIsValue = false;
        } else if (definition[item]) {
            definition.lastKey = definition[item];
            nextIsValue = true;
        } else if ('-v' === item) {
            config['verbose'] = true;
        } else if (item.indexOf('-') === 0) {
            if (isServer) {
                printServerHelp();
            } else {
                printLocalHelp();
            }
            process.exit(2);
        }

    });
    Object.assign(configRet, config);
    return config;
}

function transformToPortPassword(config: Config): Config {
    let len = Object.keys(config.port_password).length;
    if (len > 0 && (config['server_port'] || config['password'])) {
        log.warn('warning: if had port_password , server_port and password will be ignored');
    }
    if (len === 0) {
        let port = config['server_port'].toString();
        config.port_password[port] = config['password'];
    }
    if (config.servers.length === 0) {
        config.servers = [config['server']];
    }
    return config;
}

function afterProcess(config: Config) {
    if (config.verbose) {
        log.config(log.VERBOSE);
    }
}

/**
 * getBaseConfig
 */
function getBaseConfig(configFileName: string, isServer: boolean): Config {
    let configPath = findConfigPath(configFileName);
    let configFromArgs = parseArgs(isServer);
    if (configFromArgs['config_file']) {
        configPath = configFromArgs['config_file'];
    }
    let config = checkConfigPath(configPath);
    Object.assign(config, configFromArgs);
    checkConfig(config);
    config = transformToPortPassword(config);
    afterProcess(config);
    return config;
}


function getServerConfig(): Config {
    return getBaseConfig(configFileName, true);
}


function getServerExpandedConfigArray(): ExpandedConfig[] {
    let config = getServerConfig();
    let expandedConfigArray: ExpandedConfig[] = [];
    if (config.timeout == null) {
        config.timeout = 8;
    }
    let timeout = Math.floor(config.timeout * 1000) || 300000;

    if (config.port_password == null) {
        return []
    }

    Object.keys(config.port_password).forEach(port => {
        if (config.port_password == null) {
            return []
        }
        let password = config['port_password'][port];
        if (config.servers == null) {
            return expandedConfigArray
        }
        config['servers'].forEach((server_ip) => {
            let expandedConfig = {
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
    getServerExpandedConfigArray
};

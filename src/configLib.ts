const fs = require("fs");
const path = require("path");
const log = require("./log");

const configFileName: string = "ssconfig.json";

interface Config {
    server?: string
    servers?: string[]
    server_port?: number
    password?: string
    port_password?: { [key: string]: string }
    method: string
    config_file?: string
    timeout?: number
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


function checkConfigFile(configPath: string): Config {
    let config: Config = {
        server: "0.0.0.0",
        server_port: 8388,
        password: "foobar",
        method: "aes-256-cfb",
        timeout: 600
    };
    if (!configPath) {
        return config;
    }
    log.info('loading config from ' + configPath);
    let configContent = fs.readFileSync(configPath);
    try {
        let config2 = JSON.parse(configContent.toString("utf8"));
        Object.assign(config, config2);
        return config;
    } catch (e) {
        log.error('found an error in config.json: ' + e.message);
        process.exit(1);
        return config
    }
}

function checkConfig(config: Config) {
    if (!(config['server'] && (config['server_port'] || config['port_password']) && config['password'])) {
        log.warn('config.json not found, you have to specify all config in commandline');
        process.exit(1);
    }

    if (config.server === '127.0.0.1' || config.server === 'localhost') {
        log.warn("Server is set to " + config.server + ", maybe it's not correct");
        log.warn("Notice server will listen at " + config.server + ":" + config['server_port']);
    }
    if ((config.method || '').toLowerCase() === 'rc4') {
        return log.warn('RC4 is not safe; please use a safer cipher, like AES-256-CFB');
    }
}

function parseArgs(isServer = false): Config {
    let argv = process.argv;
    let definition: { [key: string]: string } = {
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
    return config;
}

function transform(config: Config): Config {
    if (config['port_password']) {
        if (config['server_port'] || config['password']) {
            log.warn('warning: port_password should not be used with server_port and password. server_port and password will be ignored');
        }
    } else {
        config.port_password = {};
        let port = config["server_port"];
        if (port == null) {
            port = 8388
        }
        Object.assign(config.port_password, {[port.toString()]: config.password});
        // config['port_password'][config['server_port'].toString()] = config['password'];
        delete config['server_port'];
        delete config['password'];
    }
    if (config['server'] == null) {
        config.server = "0.0.0.0"
    }
    config.servers = [config['server']];
    return config;
}

/**
 * 重要函数
 */
function getConfig(configFileName: string, isServer: boolean) {
    let configPath = findConfigPath(configFileName);
    let configFromArgs = parseArgs(isServer);
    if (configFromArgs['config_file']) {
        configPath = configFromArgs['config_file'];
    }
    let config = checkConfigFile(configPath);
    Object.assign(config, configFromArgs);
    checkConfig(config);
    config = transform(config);
    afterProcess(config);
    return config;
}

function afterProcess(config: any) {
    if (config.verbose) {
        log.config(log.DEBUG);
    }
}

function getServerConfig() {
    return getConfig(configFileName, true);
}


function getServerExpandedConfigArray(): ExpandedConfig[] {
    let config = getServerConfig();
    let expandedConfigArray: ExpandedConfig[] = [];
    if (config.timeout == null) {
        config.timeout = 600;
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
        config['servers'].forEach((server_ip: string) => {
            let expandedConfig: ExpandedConfig = {
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

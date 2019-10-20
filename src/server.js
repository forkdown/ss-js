"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 # as sslocal:
 # stage 0 SOCKS hello received from local, send hello to local
 # stage 1 addr received from local, query DNS for remote
 # stage 2 UDP assoc
 # stage 3 DNS resolved, connect to remote
 # stage 4 still connecting, more data from local received
 # stage 5 remote connected, piping local and remote
 # as ssserver:
 # stage 0 just jump to stage 1
 # stage 1 addr received from local, query DNS for remote
 # stage 3 DNS resolved, connect to remote
 # stage 4 still connecting, more data from local received
 # stage 5 remote connected, piping local and remote
 **/
var net_1 = __importDefault(require("net"));
var configLib = require("./configLib");
var udpRelay = require("./udprelay");
var utils = require("./utils");
var inet = require("./inet");
var log = require("./log");
var Encryptor = require("./encrypt").Encryptor;
// 连接总数
// 这是个全局的变量
var connections = 0;
function handlerConnection(config) {
    return function (connection) {
        // 下面的内容是每个local 与 server 建立一次连接 就会初始化一个
        connections++;
        var encryptor = new Encryptor(config.password, config.method);
        var stage = 0;
        //头部长度
        var headerLength = 0;
        // todo 一会儿试试 new Socket
        var remote = new net_1.default.Socket();
        // 接收缓存
        var cachedPieces = [];
        // 地址长度
        var addrLen = 0;
        // remote地址
        var remoteAddr = "";
        // remote端口
        var remotePort = 0;
        log.debug("connections: " + connections);
        /**
         * connection on data
         */
        connection.on("data", function (data) {
            var addrtype, buf;
            log.debug("connection on data");
            /////////////
            try {
                data = encryptor.decrypt(data);
            }
            catch (e) {
                log.error("connection on data error " + e);
                if (remote) {
                    remote.destroy();
                }
                if (connection) {
                    connection.destroy();
                }
                return;
            }
            ////////////////////
            try {
                if (stage === 0) {
                    /////////////////////
                    addrtype = data[0];
                    if (addrtype === void 0) {
                        return;
                    }
                    /////////////
                    if (addrtype === 3) {
                        addrLen = data[1];
                    }
                    else if (addrtype !== 1 && addrtype !== 4) {
                        log.error("unsupported addrtype: " + addrtype + " maybe wrong password");
                        connection.destroy();
                        return;
                    }
                    if (addrtype === 1) {
                        remoteAddr = utils.inetNtoa(data.slice(1, 5));
                        remotePort = data.readUInt16BE(5);
                        headerLength = 7;
                    }
                    else if (addrtype === 4) {
                        remoteAddr = inet.inet_ntop(data.slice(1, 17));
                        remotePort = data.readUInt16BE(17);
                        headerLength = 19;
                    }
                    else {
                        remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
                        remotePort = data.readUInt16BE(2 + addrLen);
                        headerLength = 2 + addrLen + 2;
                    }
                    if (data.length > headerLength) {
                        buf = Buffer.alloc(data.length - headerLength);
                        data.copy(buf, 0, headerLength);
                        cachedPieces.push(buf);
                        buf = null;
                    }
                    connection.pause();
                    ///////////////////////////
                    remote = net_1.default.createConnection(remotePort, remoteAddr, function () {
                        log.info("connect " + remoteAddr + ":" + remotePort);
                        if (!connection) {
                            remote.destroy();
                            return;
                        }
                        //好重要
                        if (!remote) {
                            log.error("remote lost");
                            return;
                        }
                        connection.resume();
                        while (cachedPieces.length) {
                            remote.write(cachedPieces.shift());
                        }
                        stage = 5;
                        return log.debug("stage = 5");
                    });
                    remote.on("data", function (data) {
                        log.debug("remote on data");
                        if (!encryptor) {
                            if (remote) {
                                remote.destroy();
                            }
                            return;
                        }
                        data = encryptor.encrypt(data);
                        if (!connection.write(data)) {
                            return remote.pause();
                        }
                    });
                    remote.on("end", function () {
                        log.debug("remote on end");
                        if (connection) {
                            return connection.end();
                        }
                    });
                    remote.on("error", function (e) {
                        log.debug("remote on error");
                        return log.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
                    });
                    remote.on("close", function (had_error) {
                        log.debug("remote on close:" + had_error);
                        if (had_error) {
                            if (connection) {
                                return connection.destroy();
                            }
                        }
                        else {
                            if (connection) {
                                return connection.end();
                            }
                        }
                    });
                    remote.on("drain", function () {
                        log.debug("remote on drain");
                        if (connection) {
                            return connection.resume();
                        }
                    });
                    remote.setTimeout(config.timeout, function () {
                        log.debug("remote on timeout during connect()");
                        if (remote) {
                            remote.destroy();
                        }
                        if (connection) {
                            return connection.destroy();
                        }
                    });
                    stage = 4;
                    log.debug("stage = 4");
                    return;
                }
                if (stage === 4) {
                    cachedPieces.push(data);
                }
                if (stage === 5) {
                    if (!remote.write(data)) {
                        connection.pause();
                    }
                }
            }
            catch (e) {
                log.error(e.stack);
                if (remote) {
                    remote.destroy();
                }
                if (connection) {
                    connection.destroy();
                }
            }
        });
        connection.on("end", function () {
            log.debug("connection on end");
            if (remote) {
                return remote.end();
            }
        });
        connection.on("error", function (e) {
            log.debug("connection on error");
            return log.error("local error: " + e);
        });
        connection.on("close", function (had_error) {
            log.debug("connection on close:" + had_error);
            if (had_error) {
                if (remote) {
                    remote.destroy();
                }
            }
            else {
                if (remote) {
                    remote.end();
                }
            }
            log.debug("clean");
            connections--;
            remote.destroy();
            connection.destroy();
            encryptor = null;
            log.debug("connections: " + connections);
        });
        connection.on("drain", function () {
            log.debug("connection on drain");
            if (remote) {
                return remote.resume();
            }
        });
        connection.setTimeout(config.timeout, function () {
            log.debug("connection on timeout");
            if (remote) {
                remote.destroy();
            }
            if (connection) {
                return connection.destroy();
            }
        });
    };
}
//{port, password, server_ip, method, timeout}
function createServer(config) {
    log.info("calculating ciphers for port " + config.port);
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    var server = net_1.default.createServer(handlerConnection(config));
    server.on("error", function (e) {
        if (e.code === "EADDRINUSE") {
            log.error("Address in use, aborting");
            process.exit(1);
        }
        else {
            log.error("unknown error happened " + e);
        }
        process.stdout.on('drain', function () {
            process.exit(1);
        });
    });
    server.listen(config.port, config.server_ip, function () {
        log.info("server listening at " + config.server_ip + ":" + config.port + " ");
    });
}
function main() {
    console.log("\n", utils.version, "\n");
    var configArr = configLib.getServerExpandedConfigArray();
    configArr.forEach(function (config) {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    });
}
main();
//# sourceMappingURL=server.js.map
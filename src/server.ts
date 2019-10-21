/**
 # as ss-local:
 # stage 0 SOCKS hello received from local, send hello to local
 # stage 1 addr received from local, query DNS for remote
 # stage 2 UDP assoc
 # stage 3 DNS resolved, connect to remote
 # stage 4 still connecting, more data from local received
 # stage 5 remote connected, piping local and remote
 # as ss-server:
 # stage 0 just jump to stage 1
 # stage 1 addr received from local, query DNS for remote
 # stage 3 DNS resolved, connect to remote
 # stage 4 still connecting, more data from local received
 # stage 5 remote connected, piping local and remote
 **/
import net from "net";
import {ExpandedConfig} from "./configLib";

const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;

// 连接总数
// 这是个全局的变量
let connections = 0;

function handlerConnection(config: ExpandedConfig) {
    return function (connection: net.Socket) {
        // 下面的内容是每个local 与 server 建立一次连接 就会初始化一个
        connections++;
        log.debug("connections: " + connections);

        let encryptor = new Encryptor(config.password, config.method);
        let stage = 0;
        let headerLength = 0;
        let remote = new net.Socket();
        let cachedPieces: any[] = [];
        let addrLen = 0;
        let remoteAddr: string = "";
        let remotePort: number = 0;

        /**
         * connection on data
         */
        connection.on("data", function (data) {
            log.debug("connection on data");
            /////////////
            try {
                data = encryptor.decrypt(data);
            } catch (e) {
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
                    let addrType = data[0];
                    if (addrType === void 0) {
                        return;
                    }
                    if (addrType !== 3 && addrType !== 1 && addrType !== 4) {
                        log.error("unsupported addrtype: " + addrType + " maybe wrong password");
                        connection.destroy();
                        return;
                    }
                    if (addrType === 3) {
                        addrLen = data[1];
                        remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
                        remotePort = data.readUInt16BE(2 + addrLen);
                        headerLength = 2 + addrLen + 2;
                    }
                    if (addrType === 1) {
                        remoteAddr = utils.inetNtoa(data.slice(1, 5));
                        remotePort = data.readUInt16BE(5);
                        headerLength = 1 + 4 + 2;
                    }
                    if (addrType === 4) {
                        remoteAddr = inet.inet_ntop(data.slice(1, 17));
                        remotePort = data.readUInt16BE(17);
                        headerLength = 1 + 16 + 2;
                    }
                    //  拿到 remoteAddr, remotePort, headerLength
                    ////////////////////////////
                    if (data.length > headerLength) {
                        cachedPieces.push(Buffer.from(data.slice(headerLength)));
                    }
                    connection.pause();
                    ///////////////////////////
                    remote.connect(remotePort, remoteAddr, () => {
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

                    stage = 4;
                    log.debug("stage = 4");
                    return
                }
                if (stage === 4) {
                    cachedPieces.push(data);
                }
                if (stage === 5) {
                    if (!remote.write(data)) {
                        connection.pause();
                    }
                }
            } catch (e) {
                log.error(e.stack);
                if (remote) {
                    remote.destroy();
                }
                if (connection) {
                    connection.destroy();
                }
            }

        });

        remote.on("data", function (data: Buffer) {
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
        remote.on("error", function (e: String) {
            log.debug("remote on error");
            return log.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
        });
        remote.on("close", function (had_error: String) {
            log.debug("remote on close:" + had_error);
            if (had_error) {
                if (connection) {
                    return connection.destroy();
                }
            } else {
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
            } else {
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
    }
        ;
}

//{port, password, server_ip, method, timeout}
function createServer(config: ExpandedConfig) {
    log.info("calculating ciphers for port " + config.port);
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    let server = net.createServer(handlerConnection(config));

    server.on("error", (e: any) => {
        if (e.code === "EADDRINUSE") {
            log.error("Address in use, aborting");
            process.exit(1);
        } else {
            log.error("unknown error happened " + e);
        }
        process.stdout.on('drain', () => {
            process.exit(1);
        });
    });

    server.listen(config.port, config.server_ip, () => {
        log.info("server listening at " + config.server_ip + ":" + config.port + " ");
    });
}


function main() {
    console.log("\n", utils.version, "\n");
    let configArr: ExpandedConfig[] = configLib.getServerExpandedConfigArray();
    configArr.forEach((config: ExpandedConfig) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


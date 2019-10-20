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
import net from "net";
import {ExpandedConfig} from "./configLib";

const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;

let connections = 0;

function handlerConnection(config: ExpandedConfig) {
    return function (connection: net.Socket) {
        //////////////
        let addrLen: any, cachedPieces: any, clean: any, encryptor: any,
            headerLength: number, remote: any, remoteAddr: any,
            remotePort: any;
        ///////////////
        connections++;
        encryptor = new Encryptor(config.password, config.method);

        let stage = 0;

        headerLength = 0;
        remote = null;
        cachedPieces = [];
        addrLen = 0;
        remoteAddr = null;
        remotePort = null;
        log.debug("connections: " + connections);
        clean = function () {
            log.debug("clean");
            connections -= 1;
            remote = null;
            connection.destroy();
            encryptor = null;
            return log.debug("connections: " + connections);
        };
        /**
         * connection on data
         */
        connection.on("data", function (data) {
            let addrtype, buf;
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
                    addrtype = data[0];
                    if (addrtype === void 0) {
                        return;
                    }
                    /////////////
                    if (addrtype === 3) {
                        addrLen = data[1];
                    } else if (addrtype !== 1 && addrtype !== 4) {
                        log.error("unsupported addrtype: " + addrtype + " maybe wrong password");
                        connection.destroy();
                        return;
                    }
                    if (addrtype === 1) {
                        remoteAddr = utils.inetNtoa(data.slice(1, 5));
                        remotePort = data.readUInt16BE(5);
                        headerLength = 7;
                    } else if (addrtype === 4) {
                        remoteAddr = inet.inet_ntop(data.slice(1, 17));
                        remotePort = data.readUInt16BE(17);
                        headerLength = 19;
                    } else {
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
                    remote = net.createConnection(remotePort, remoteAddr, () => {
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
            return clean();
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


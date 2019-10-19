import net from "net";
import ConfigLib, {ExpandedConfig} from "./ConfigLib";

// const net = require("net");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;

let connections = 0;

function handlerConnection(config: ExpandedConfig) {
    return function (connection: net.Socket) {
        let addrLen: any, cachedPieces: any, clean: any, encryptor: any,
            headerLength, remote: any, remoteAddr: any,
            remotePort: any, stage: any;
        connections += 1;
        encryptor = new Encryptor(config.password, config.method);
        stage = 0;
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
        connection.on("data", function (data) {
            let addrtype, buf;
            utils.log(utils.EVERYTHING, "connection on data");
            /////////////
            try {
                data = encryptor.decrypt(data);
            } catch (_error) {
                let e = _error;
                utils.error(e);
                if (remote) {
                    remote.destroy();
                }
                if (connection) {
                    connection.destroy();
                }
                return;
            }
            ////////////////////
            if (stage === 5) {
                if (!remote.write(data)) {
                    connection.pause();
                }
                return;
            }
            if (stage === 0) {
                try {
                    /////////////////////
                    addrtype = data[0];
                    if (addrtype === void 0) {
                        return;
                    }
                    /////////////
                    if (addrtype === 3) {
                        addrLen = data[1];
                    } else if (addrtype !== 1 && addrtype !== 4) {
                        utils.error("unsupported addrtype: " + addrtype + " maybe wrong password");
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
                        let dataLength = data.length;
                        console.log(remoteAddr);
                        remotePort = data.readUInt16BE(2 + addrLen);
                        headerLength = 2 + addrLen + 2;
                    }
                    connection.pause();
                    remote = net.connect(remotePort, remoteAddr, function () {
                        let i, piece;
                        utils.info("connecting " + remoteAddr + ":" + remotePort);
                        if (!encryptor || !remote || !connection) {
                            if (remote) {
                                remote.destroy();
                            }
                            return;
                        }
                        i = 0;
                        connection.resume();
                        while (i < cachedPieces.length) {
                            piece = cachedPieces[i];
                            remote.write(piece);
                            i++;
                        }
                        cachedPieces = null;
                        remote.setTimeout(config.timeout, function () {
                            utils.debug("remote on timeout during connect()");
                            if (remote) {
                                remote.destroy();
                            }
                            if (connection) {
                                return connection.destroy();
                            }
                        });
                        stage = 5;
                        return utils.debug("stage = 5");
                    });
                    remote.on("data", function (data: Buffer) {
                        utils.log(utils.EVERYTHING, "remote on data");
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
                        utils.debug("remote on end");
                        if (connection) {
                            return connection.end();
                        }
                    });
                    remote.on("error", function (e: String) {
                        utils.debug("remote on error");
                        return utils.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
                    });
                    remote.on("close", function (had_error: String) {
                        utils.debug("remote on close:" + had_error);
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
                        utils.debug("remote on drain");
                        if (connection) {
                            return connection.resume();
                        }
                    });
                    remote.setTimeout(15 * 1000, function () {
                        utils.debug("remote on timeout during connect()");
                        if (remote) {
                            remote.destroy();
                        }
                        if (connection) {
                            return connection.destroy();
                        }
                    });
                    if (data.length > headerLength) {
                        buf = new Buffer(data.length - headerLength);
                        data.copy(buf, 0, headerLength);
                        cachedPieces.push(buf);
                        buf = null;
                    }
                    stage = 4;
                    return utils.debug("stage = 4");
                } catch (_error) {
                    let e = _error;
                    utils.error(e);
                    connection.destroy();
                    if (remote) {
                        return remote.destroy();
                    }
                }
            } else {
                if (stage === 4) {
                    return cachedPieces.push(data);
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
            utils.debug("connection on error");
            return utils.error("local error: " + e);
        });
        connection.on("close", function (had_error) {
            utils.debug("connection on close:" + had_error);
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
            utils.debug("connection on drain");
            if (remote) {
                return remote.resume();
            }
        });
        connection.setTimeout(config.timeout, function () {
            utils.debug("connection on timeout");
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
function createServer(config: ExpandedConfig) {
    log.info("calculating ciphers for port " + config.port);
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    let server = net.createServer(handlerConnection(config));
    server.listen(config.port, config.server_ip, () => {
        log.info("server listening at " + config.server_ip + ":" + config.port + " ");
    });
    server.on("error", (e: any) => {
        if (e.code === "EADDRINUSE") {
            log.error("Address in use, aborting");
        } else {
            log.error(e);
        }
        process.stdout.on('drain', () => {
            process.exit(1);
        });
    });
}


function main() {
    console.log(utils.version);
    let configArr: ExpandedConfig[] = ConfigLib.getServerExpandedConfigArray();
    console.log(configArr);
    configArr.forEach((config: any) => {
        createServer(config);
    })
}

main();


const net = require("net");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const configLib = require("./configLib");
const log = require("./log");
const Encryptor = require("./encrypt").Encryptor;


function getConnectionListener(connections, KEY, METHOD, timeout) {
    return function (connection) {
        let addrLen, cachedPieces, clean, encryptor, headerLength, remote, remoteAddr, remotePort,
            stage;
        connections += 1;
        encryptor = new Encryptor(KEY, METHOD);
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
            connection = null;
            encryptor = null;
            return log.debug("connections: " + connections);
        };
        connection.on("data", function (data) {
            let addrtype, buf;
            utils.log(utils.EVERYTHING, "connection on data");
            try {
                data = encryptor.decrypt(data);
            } catch (_error) {
                e = _error;
                utils.error(e);
                if (remote) {
                    remote.destroy();
                }
                if (connection) {
                    connection.destroy();
                }
                return;
            }
            if (stage === 5) {
                if (!remote.write(data)) {
                    connection.pause();
                }
                return;
            }
            if (stage === 0) {
                try {
                    addrtype = data[0];
                    if (addrtype === void 0) {
                        return;
                    }
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
                        remote.setTimeout(timeout, function () {
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
                    remote.on("data", function (data) {
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
                    remote.on("error", function (e) {
                        utils.debug("remote on error");
                        return utils.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
                    });
                    remote.on("close", function (had_error) {
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
                    e = _error;
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
        connection.setTimeout(timeout, function () {
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

function createServer(port, key, ip, connections, method, timeout) {

    log.info("calculating ciphers for port " + port);
    let server = net.createServer(getConnectionListener(connections, key, method, timeout));
    server.listen(port, ip, function () {
        log.info("server listening at " + ip + ":" + port + " ");
    });
    udpRelay.createServer(ip, port, null, null, key, method, timeout, false);
    server.on("error", function (e) {
        if (e.code === "EADDRINUSE") {
            utils.error("Address in use, aborting");
        } else {
            utils.error(e);
        }
        process.stdout.on('drain', function () {
            process.exit(1);
        });
    });
}

function main() {
    console.log(utils.version);
    let config = configLib.getServerConfig();
    console.log(config);
    //////////////////////
    let timeout = Math.floor(config.timeout * 1000) || 300000;
    let portPassword = config['port_password'];
    let method = config['method'];
    let servers = config['server'];
    ///////////////////
    let connections = 0;
    Object.keys(portPassword).forEach(port => {
        let key = portPassword[port];
        servers.forEach(ip => {
            createServer(port, key, ip, connections, method, timeout)
        });
    });
}

main();


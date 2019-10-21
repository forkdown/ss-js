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
import Shadow from "./Shadow";

const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const log = require("./log");

function localSocketListener(config: ExpandedConfig) {
    return function (localSocket: net.Socket) {
        let remoteSocket = new net.Socket();
        let shadow = new Shadow(config.password, config.method);
        localSocket.on("data", function (data) {
            let data2: Buffer = Buffer.from(data);
            shadow.onLocalData(data2);
            if (remoteSocket.writable) {
                if (!remoteSocket.write(shadow.dataCacheFromLocal.shift())) {
                    localSocket.pause();
                }
                return;
            }
            localSocket.pause();
            remoteSocket.connect(shadow.remotePort, shadow.remoteAddr, () => {
                log.info("connect " + shadow.remoteAddr + ":" + shadow.remotePort);
                if (!localSocket) {
                    remoteSocket.destroy();
                    return;
                }
                localSocket.resume();
                while (shadow.dataCacheFromLocal.length) {
                    remoteSocket.write(shadow.dataCacheFromLocal.shift());
                }
            });
            return
        });

        remoteSocket.on("data", function (data: Buffer) {
            log.debug("remote on data");
            shadow.onRemoteData(data);
            while (shadow.dataCacheFromRemote.length) {
                if (!localSocket.write(shadow.dataCacheFromRemote.shift())) {
                    return remoteSocket.pause();
                }
            }
        });
        remoteSocket.on("end", function () {
            log.debug("remote on end");
            if (localSocket) {
                return localSocket.end();
            }
        });
        remoteSocket.on("error", function (e: String) {
            log.debug("remote on error");
            if (remoteSocket) {
                remoteSocket.destroy();
            }
            if (localSocket) {
                localSocket.destroy();
            }
            return log.error("remote " + shadow.remoteAddr + ":" + shadow.remotePort + " error: " + e);
        });
        remoteSocket.on("close", function (had_error: String) {
            log.debug("remote on close:" + had_error);
            if (had_error) {
                if (localSocket) {
                    return localSocket.destroy();
                }
            } else {
                if (localSocket) {
                    return localSocket.end();
                }
            }
        });
        remoteSocket.on("drain", function () {
            log.debug("remote on drain");
            if (localSocket) {
                return localSocket.resume();
            }
        });
        remoteSocket.setTimeout(config.timeout, function () {
            log.debug("remote on timeout during connect()");
            if (remoteSocket) {
                remoteSocket.destroy();
            }
            if (localSocket) {
                return localSocket.destroy();
            }
        });
        localSocket.on("end", function () {
            log.debug("connection on end");
            if (remoteSocket) {
                return remoteSocket.end();
            }
        });
        localSocket.on("error", function (e) {
            log.debug("connection on error");
            return log.error("local error: " + e);
        });
        localSocket.on("close", function (had_error) {
            log.debug("connection on close:" + had_error);
            if (had_error) {
                if (remoteSocket) {
                    remoteSocket.destroy();
                }
            } else {
                if (remoteSocket) {
                    remoteSocket.end();
                }
            }
            log.debug("clean");
        });
        localSocket.on("drain", function () {
            log.debug("connection on drain");
            if (remoteSocket) {
                return remoteSocket.resume();
            }
        });
        localSocket.setTimeout(config.timeout, function () {
            log.debug("connection on timeout");
            if (remoteSocket) {
                remoteSocket.destroy();
            }
            if (localSocket) {
                return localSocket.destroy();
            }
        });
    };
}

function createServer(config: ExpandedConfig) {
    log.info("calculating ciphers for port " + config.port);
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    const server = new net.Server();
    server.on("connection", localSocketListener(config));
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
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr: ExpandedConfig[] = configLib.getServerExpandedConfigArray();
    configArr.forEach((config: ExpandedConfig) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


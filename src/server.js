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


import Shadow from "./Shadow";
import {ExpandedConfig} from "./configLib";

const net = require("net");
const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const log = require("./log");

function localSocketListener(config) {
    return function (localSocket) {
        let remoteSocket = new net.Socket();
        let shadow = new Shadow(config.password, config.method, localSocket, remoteSocket);

        function clean() {
            setTimeout(() => {
                remoteSocket = undefined;
                localSocket = undefined;
                shadow = undefined;
            }, 6000)
        }

        localSocket.on("data", function (data) {
            shadow.onLocalData(data);
            if (!remoteSocket.writable) {
                remoteSocket.connect(shadow.remotePort, shadow.remoteAddr, () => {
                    log.info("connect " + shadow.remoteAddr + ":" + shadow.remotePort);
                });
            }
            shadow.writeToRemote();
        });
        remoteSocket.on("data", function (data) {
            shadow.onRemoteData(data);
            shadow.writeToLocal();
        });

        remoteSocket.on("end", function () {
            shadow.destroy();
            clean();
        });
        remoteSocket.on("error", function (e) {
            shadow.destroy();
            clean();
        });
        remoteSocket.on("close", function (had_error) {
            shadow.destroy();
            clean();
        });
        remoteSocket.on("drain", function () {
            shadow.resume();
        });
        remoteSocket.setTimeout(config.timeout, function () {
            shadow.destroy();
            clean();
        });

        localSocket.on("end", function () {
            shadow.destroy();
            clean();
        });
        localSocket.on("error", function (e) {
            shadow.destroy();
            clean();
        });
        localSocket.on("close", function (had_error) {
            shadow.destroy();
            clean();
        });
        localSocket.on("drain", function () {
            shadow.resume();
        });
        localSocket.setTimeout(config.timeout, function () {
            shadow.destroy();
            clean();
        });
    };
}

function createServer(config) {
    log.info("calculating ciphers for port " + config.port);
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    const server = new net.Server();
    server.on("connection", localSocketListener(config));
    server.on("error", (e) => {
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
    setInterval(() => {
        console.log(process.memoryUsage().rss / 1e6);
        if (process.memoryUsage().rss / 1e6 > 30) {
            process.exit(0);
        }
    }, 6000);
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr:ExpandedConfig = configLib.getServerExpandedConfigArray();
    configArr.forEach((config) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


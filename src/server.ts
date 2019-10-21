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
        let shadow = new Shadow(config.password, config.method, localSocket, remoteSocket);

        localSocket.on("data", function (data) {
            shadow.onLocalData(data);
            if (!remoteSocket.writable) {
                remoteSocket.connect(shadow.remotePort, shadow.remoteAddr, () => {
                    log.info("connect " + shadow.remoteAddr + ":" + shadow.remotePort);
                });
            }
            shadow.writeToRemote();
        });
        remoteSocket.on("data", function (data: Buffer) {
            shadow.onRemoteData(data);
            shadow.writeToLocal();
        });

        remoteSocket.on("end", function () {
            shadow.destroy();
        });
        remoteSocket.on("error", function (e: String) {
            shadow.destroy();
        });
        remoteSocket.on("close", function (had_error: String) {
            shadow.destroy();
        });
        remoteSocket.on("drain", function () {
            shadow.resume();
        });
        remoteSocket.setTimeout(config.timeout, function () {
            shadow.destroy();
        });

        localSocket.on("end", function () {
            shadow.destroy();
        });
        localSocket.on("error", function (e) {
            shadow.destroy();
        });
        localSocket.on("close", function (had_error) {
            shadow.destroy();
        });
        localSocket.on("drain", function () {
            shadow.resume();
        });
        localSocket.setTimeout(config.timeout, function () {
            shadow.destroy();
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
    setInterval(() => {
        console.log(process.memoryUsage().rss / 1e6);
        global.gc();
    }, 200);
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr: ExpandedConfig[] = configLib.getServerExpandedConfigArray();
    configArr.forEach((config: ExpandedConfig) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


import {ExpandedConfig} from "./configLib";
import * as net from "net";
import {Socket} from "net";
import {Shadow} from "./shadow";

const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const log = require("./log");

const memoryThread = 300;

function addEventListeners(socket: Socket, shadow: Shadow, config: ExpandedConfig) {
    socket.on("end", function () {
        shadow.onClose();
    });
    socket.on("error", function () {
        shadow.onClose();
    });
    socket.on("close", function () {
        shadow.onClose();
    });
    socket.on("drain", function () {
        shadow.onDrain();
    });
    socket.setTimeout(config.timeout, function () {
        shadow.onClose();
    });
}

function localSocketListener(config: ExpandedConfig) {
    return function (localSocket: Socket) {
        let remoteSocket = new Socket();
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
        remoteSocket.on("data", function (data) {
            shadow.onRemoteData(data);
            shadow.writeToLocal();
        });

        addEventListeners(remoteSocket, shadow, config);
        addEventListeners(localSocket, shadow, config);

    };
}

function createServer(config: ExpandedConfig) {
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
        let memoryUsed = Math.floor(process.memoryUsage().rss / 1e6);
        log.info("memory used : " + memoryUsed + "MB ");
        if (process.memoryUsage().rss / 1e6 > memoryThread) {
            // process.exit(1);
        }
    }, 6000);
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr = configLib.getServerExpandedConfigArray();
    configArr.forEach((config: ExpandedConfig) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


import {ExpandedConfig} from "./common/configJson";
import {Server, Socket} from "net";
import {ChaCha20} from "./aead/ChaCha20";

const configLib = require("./common/configJson");
const log = require("./common/log");

const MAX_MEMORY_THREAD = 128;

function localSocketListener(config: ExpandedConfig) {
    return function (localSocket: Socket) {
        let remoteSocket = new Socket();
        let shadow = new ChaCha20(config.password, config.method, localSocket, remoteSocket);
        // let shadow = new Shadow(config.password, config.method, localSocket, remoteSocket);

        localSocket.on("data", function (data) {
            shadow.onDataLocal(data);
            if (!remoteSocket.writable) {
                remoteSocket.connect(shadow.remotePort, shadow.remoteAddr, () => {
                    log.info("connect " + shadow.remoteAddr + ":" + shadow.remotePort);
                });
            }
            shadow.writeToRemote();
        });
        remoteSocket.on("data", function (data) {
            shadow.onDataRemote(data);
            shadow.writeToLocal();
        });

        remoteSocket.on("end", function () {
            localSocket.end();
        });
        remoteSocket.on("error", function () {
            localSocket.end();
        });
        remoteSocket.on("close", function (err) {
            localSocket.end()
        });
        remoteSocket.on("drain", function () {
            localSocket.resume();
        });
        remoteSocket.setTimeout(config.timeout, function () {
            remoteSocket.destroy();
        });


        localSocket.on("end", function () {
            remoteSocket.end();
        });
        localSocket.on("error", function () {
            remoteSocket.end();
        });
        localSocket.on("close", function (err) {
            remoteSocket.end()
        });
        localSocket.on("drain", function () {
            remoteSocket.resume();
        });
        localSocket.setTimeout(config.timeout, function () {
            localSocket.destroy();
        });
    };
}

function createServer(config: ExpandedConfig) {
    const server = new Server();
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
        if (process.memoryUsage().rss / 1e6 > MAX_MEMORY_THREAD) {
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


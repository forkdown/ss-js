import {ExpandedConfig} from "./common/configJson";
import {Server, Socket} from "net";
import {Shadow} from "./protocol/shadow";
import {ShadowAEAD} from "./aead/ShadowAEAD";

const configLib = require("./common/configJson");
const log = require("./common/log");

const MAX_MEMORY_THREAD = 300;

function addNecessaryListeners(socket: Socket, shadow: ShadowAEAD, config: ExpandedConfig) {
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
        let shadow = new ShadowAEAD(config.password, config.method, localSocket, remoteSocket);
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

        addNecessaryListeners(remoteSocket, shadow, config);
        addNecessaryListeners(localSocket, shadow, config);

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


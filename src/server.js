"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const net_1 = require("net");
const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const log = require("./log");
const { Shadow } = require("./shadow");
function localSocketListener(config) {
    return function (localSocket) {
        let remoteSocket = new net_1.Socket();
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
        remoteSocket.on("end", function () {
            shadow.onClose();
        });
        remoteSocket.on("error", function () {
            shadow.onClose();
        });
        remoteSocket.on("close", function () {
            shadow.onClose();
        });
        remoteSocket.on("drain", function () {
            shadow.onDrain();
        });
        remoteSocket.setTimeout(config.timeout, function () {
            shadow.onClose();
        });
        localSocket.on("end", function () {
            shadow.onClose();
        });
        localSocket.on("error", function () {
            shadow.onClose();
        });
        localSocket.on("close", function () {
            shadow.onClose();
        });
        localSocket.on("drain", function () {
            shadow.onDrain();
        });
        localSocket.setTimeout(config.timeout, function () {
            shadow.onClose();
        });
    };
}
function createServer(config) {
    // udpRelay.createServer(server_ip, port, null, null, password, method, timeout, false);
    const server = new net.Server();
    server.on("connection", localSocketListener(config));
    server.on("error", (e) => {
        if (e.code === "EADDRINUSE") {
            log.error("Address in use, aborting");
            process.exit(1);
        }
        else {
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
        if (process.memoryUsage().rss / 1e6 > 300) {
            // process.exit(1);
        }
    }, 6000);
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr = configLib.getServerExpandedConfigArray();
    configArr.forEach((config) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    });
}
main();
//# sourceMappingURL=server.js.map
const net = require("net");
const configLib = require("./configLib");
const udpRelay = require("./udprelay");
const log = require("./log");
let {Shadow} = require("./Shadow");

function localSocketListener(config) {
    return function (localSocket) {
        let remoteSocket = new net.Socket();
        let shadow = new Shadow(config.password, config.method, localSocket, remoteSocket);

        function clean() {
            // setTimeout(() => {
            //     remoteSocket.end();
            //     remoteSocket.destroy();
            //     localSocket.end();
            //     localSocket.destroy();
            //     // remoteSocket = undefined;
            //     // localSocket = undefined;
            //     // shadow = undefined;
            // }, 200)
        }

        function resume() {
            remoteSocket.resume();
            localSocket.resume();
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
            clean();
        });
        remoteSocket.on("error", function (e) {
            clean();
        });
        remoteSocket.on("close", function (had_error) {
            clean();
        });
        remoteSocket.on("drain", function () {
            resume();
        });
        remoteSocket.setTimeout(config.timeout, function () {
            clean();
        });

        localSocket.on("end", function () {
            clean();
        });
        localSocket.on("error", function (e) {
            clean();
        });
        localSocket.on("close", function (had_error) {
            clean();
        });
        localSocket.on("drain", function () {
            resume();
        });
        localSocket.setTimeout(config.timeout, function () {
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
            // process.exit(0);
        }
    }, 6000);
    const pack = require("../package.json");
    console.log("\n", pack.name + " " + pack.version, "\n");
    const configArr = configLib.getServerExpandedConfigArray();
    configArr.forEach((config) => {
        log.info("start with : " + JSON.stringify(config));
        createServer(config);
    })
}

main();


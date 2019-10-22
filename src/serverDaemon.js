const log = require("./log");
const {spawn} = require("child_process");

function serverDaemon() {
    let server = spawn("node", ["src/server"]);
    // server.stdout.on("data", data => {
    //     console.log(data.toString());
    // });
    server.stdout.pipe(process.stdout);
    server.on("close", () => {
        log.error("serverDaemon on close event");
        server.kill();
        server = serverDaemon();
    });
}

serverDaemon();
setInterval(() => {
}, 60000);

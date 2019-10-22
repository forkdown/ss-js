const {spawn} = require("child_process");

let times = 0;

function serverDaemon() {
    let server = spawn("node", ["src/server"]);
    server.stdout.pipe(process.stdout);
    server.on("close", () => {
        times++;
        console.log("  \n  Server memory used too high, server restarted to release memory : " + times);
        server.kill();
        serverDaemon();
    });
}

serverDaemon();
setInterval(() => {
}, 60000);

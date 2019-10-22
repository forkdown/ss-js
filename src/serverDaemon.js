const {spawn} = require("child_process");

function serverDaemon() {
    let server = spawn("node", ["src/server"]);
    server.stdout.pipe(process.stdout);
    server.on("close", () => {
        console.log("  \n  Server memory used too high, server restarted to release memory");
        server.kill();
        serverDaemon();
    });
}

serverDaemon();
setInterval(() => {
}, 60000);

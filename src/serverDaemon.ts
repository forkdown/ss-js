const {spawn} = require("child_process");

let times = 0;

function serverDaemon() {
    let server = spawn("node", ["build/server"]);
    server.stdout.pipe(process.stdout);
    server.on("close", () => {
        times++;
        console.log("  \n  Server memory used too high, server restarted to release memory : " + times);
        server.kill();
        serverDaemon();
    });
    server.on("error", () => {
        times++;
        console.log("  \n  Server had some error occurred, server restart : " + times + "times");
        server.kill();
        serverDaemon();
    });
}

function main() {
    serverDaemon();
    setInterval(() => {
    }, 60000);
}

main();


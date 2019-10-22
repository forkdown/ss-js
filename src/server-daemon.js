const log = require("../build/log");
const {exec, spawn} = require("child_process");

function daemon() {
    let cp = spawn("node", ["build/server"]);
    cp.stdout.on("data", data => {
        log.error(data.toString());
    });
    cp.on("close", () => {
        log.error("daemon on close");
        cp.kill();
        cp = daemon();
    });
}

daemon();
setInterval(() => {
}, 10000);

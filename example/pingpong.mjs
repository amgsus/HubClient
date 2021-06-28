/*
 * By: A.G.
 * Created: 2019.12.10
 * Last modified: 2019.12.10
 */

import { MediatorClient } from "./../index.mjs";

(() => {
    let c = new MediatorClient({ wildcard: "pong8888" });
    c.onReady(startPing.bind(c)).onUpdate(pong.bind(c));
    return c;
})();

(() => {
    let c = new MediatorClient({ wildcard: "ping8888" });
    c.onUpdate(pingPong.bind(c));
    return c;
})();

let startTime = 0;

function startPing() {
    this.tag = 0;
    console.log(`Ping-pong...`);
    setInterval((() => {
        let delta = (Date.now() - startTime) / 1000;
        let bandwidth = (this.tag / delta).toFixed(1);
        console.log(`---------------------------`);
        console.log(`Total messages: ${this.tag}`);
        console.log(`Time: ${delta} sec`);
        console.log(`Through output: ${bandwidth} msg/sec`);
        startTime = Date.now();
        this.tag = 0;
    }), 2500);
    startTime = Date.now();
    ping.bind(this)();
}

function ping() {
    // console.log(`!`);
    this.store("ping8888", this.tag);
}

function pong(rav) {
    if (rav.id === "pong8888") {
        this.tag++;
        ping.bind(this)();
    }
}

function pingPong(rav) {
    if (rav.id === "ping8888") {
        this.store("pong8888", rav.value);
    }
}

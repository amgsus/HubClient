/*
 * By:              A.G.
 * Created on:      2020.07.19
 * Last modified:   2020.07.19
 */

import { createClient } from "./../../../index.mjs";

((async () => {
    let client = createClient();

    await client.awaitConnect();

    console.log(`Connected`);

    let counter = 0;

    let ping = (() => {
        client.invokeRPC("ping", [Date.now()], ((err, result) => {
            if (err) {
                console.error(err);
                process.exit();
            } else {
                // console.log(`Ping-pong: ${Date.now()-Number(result)}ms`);
                counter++;
                setImmediate(ping);
            }
        }));
    });

    ping();

    setInterval((() => {
        if (counter === 0) return;
        let avgPingPongTime = 2500 / counter;
        console.log(`[${new Date().toISOString()}] Packets: ${counter}`);
        console.log(`[${new Date().toISOString()}] Avg. ping-pong time: ${avgPingPongTime.toFixed(3)} ms`);
        counter = 0;
    }), 2500);
})());

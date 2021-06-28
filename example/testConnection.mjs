/*
 * By:              A.G.
 * Created:         2020.02.09
 * Last modified:   2020.02.11
 */

import { MediatorClient } from "./../index.mjs";

new MediatorClient({ connectNow: false, maxConnectAttempts: 1 }).connect().then((client) => {
    console.log(`Connected! Sending Hello World...`);
    client.store(`Hello`, `World!`, (() => {
        console.log(`Now disconnecting...`);
        client.disconnect();
    }));
}).catch(console.error);

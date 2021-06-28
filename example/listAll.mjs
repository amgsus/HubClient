/*
 * By:              A.G.
 * Created:         2020.02.11
 * Last modified:   2020.02.11
 */

/*
 * This example shows how to retrieve all values from Mediator.
 */

import { MediatorClient } from "./../index.mjs";

const TIMEOUT = 1000;

new MediatorClient({ wildcard: "" }).connect("192.168.96.172").then((client) => {
    const ticb = (() => {
        console.log(`Now disconnecting...`);
        client.disconnect();
    });
    let ti = setTimeout(ticb, TIMEOUT);
    console.log(`Connected! Listing all...`);
    client.on(`update`, ((notif) => {
        console.log(`${notif.absoluteName}=${notif.value}`);
        clearTimeout(ti);
        ti = setTimeout(ticb, TIMEOUT);
    }));
    client.list();
}).catch(console.error);

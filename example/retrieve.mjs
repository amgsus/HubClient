/*
 * By:              A.G.
 * Created:         2020.02.11
 * Last modified:   2020.02.11
 */

import { MediatorClient } from "./../index.mjs";

const channelName = "Gas.Shared";

new MediatorClient({ maxConnectAttempts: 1 }).connect("192.168.96.172").then((client) => {
    console.log(`Connected! Retrieving the value of '${channelName}'...`);
    client.retrieve(channelName, null, ((error, value) => {
        if (error) {
            console.error(error);
        } else {
            console.log(`Value = ${value}`);
        }
        console.log(`Now disconnecting...`);
        client.disconnect();
    }));
}).catch(console.error);

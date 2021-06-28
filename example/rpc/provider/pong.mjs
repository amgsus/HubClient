/*
 * By:              A.G.
 * Created on:      2020.07.19
 * Last modified:   2020.07.19
 */

import { createClient } from "./../../../index.mjs";

((() => {
    let client = createClient();
    client.on("rpc:ping", rpcHandler);
    client.on("ready", (() => {
        console.log(`Connected as provider`);
        client.registerRPC("ping");
    }));
})());

function rpcHandler(rpc) {
    rpc.resolve(rpc.args[0]);
}

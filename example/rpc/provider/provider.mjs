/*
 * By:              A.G.
 * Created on:      2020.07.19
 * Last modified:   2020.07.19
 */

import { createClient } from "./../../../index.mjs";

((() => {
    let client = createClient();
    client.on("rpc:sum", rpcHandler);
    client.on("ready", (() => {
        console.log(`Connected as provider`);
        client.registerRPC("sum");
    }));
})());

function
rpcHandler(rpc) {
    let sum = rpc.args.reduce(((accum, val) => accum + Number(val)), 0);
    rpc.result = sum;
    console.log(rpc);
    rpc.resolve(sum);
}

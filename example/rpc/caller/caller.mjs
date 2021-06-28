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
    client.invokeRPC("sum", [10, 20, 30, "-18"], ((err, result) => {
        if (err) {
            console.error(err);
        } else {
            console.log(`Result: ${result}`);
        }
        client.disconnect();
    }));
})());

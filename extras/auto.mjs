/*
 * Author: A.G.
 *   Date: 2021/09/12
 */

import { HubClient } from "./../lib/client.mjs";

const HOST      = process.env["HUB_HOST"];
const PORT      = process.env["HUB_PORT"];
const CLIENT_ID = process.env["HUB_CLIENT_ID"];

const singletonClient = ((() => { // Initialize client as singleton.
    let opts = {};

    if (HOST) {
        opts.host = HOST;
    }

    if (PORT) {
        opts.port = PORT;
    }

    if (CLIENT_ID) {
        opts.nickname = CLIENT_ID;
    }

    return new HubClient(opts);
})());

export default singletonClient;

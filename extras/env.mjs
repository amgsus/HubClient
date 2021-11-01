/*
 * Author: A.G.
 *   Date: 2021/09/12
 */

import { HubClient }      from "./../lib/client.mjs";
import { HubClientError } from "./../lib/common/error.mjs";

const PREDEFINED_HOST = process.env["HUB_HOST"];
const PREDEFINED_PORT = process.env["HUB_PORT"];

const singleton = ((() => { // Initialize client instance as singleton.
    let opts = {};
    if (typeof PREDEFINED_HOST !== "undefined") {
        opts.host = PREDEFINED_HOST || "localhost";
    }
    if (typeof PREDEFINED_PORT !== "undefined") {
        opts.port = Math.trunc(Number(PREDEFINED_PORT));
        if (isNaN(opts.port) || opts.port < 0 || opts.port > 65535) {
            throw HubClientError.create("PREDEFINED_PORT must be valid port number");
        }
    }
    return HubClient.create(opts);
})());

export default singleton;

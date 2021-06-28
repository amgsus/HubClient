/*
 * By:              A.G.
 * Created:         2019.09.28
 * Last modified:   2020.02.08
 */

import {
    CLIENT_DEFAULT_RETRIEVE_TIMEOUT,
    DEFAULT_HOSTNAME,
    DEFAULT_PORT
}                         from "./lib/common.mjs";
import { MediatorClient } from "./lib/client.mjs";

export { MediatorClient, DEFAULT_HOSTNAME, DEFAULT_PORT, CLIENT_DEFAULT_RETRIEVE_TIMEOUT };

export default MediatorClient;

/**
 * Creates a new instance of MediatorClient. Handy function for small listening apps.
 *
 * @param subscriptionHandlers {Object}
 *      A plain object, where the keys are variable ID's and the values are subscription handlers. These values are
 *      passed to MediatorClient.subscribe(...).
 * @param hostname {string="localhost"}
 *      ...
 * @param port {number=7777}
 *      ...
 * @param callback {function(Error?, MediatorClient)}
 *      ...
 */
export function createClient (
    subscriptionHandlers = {},
    callback = null, // TODO: Invoke callback on error or when connected.
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT
)
{
    let client = new MediatorClient({
        hostname,
        port,
        connectNow: true
    });

    if (typeof subscriptionHandlers === "object" && subscriptionHandlers !== null) {
        for ( let id in subscriptionHandlers ) {
            let callback = subscriptionHandlers[id];
            client.subscribe(id, callback);
        }
    }

    // TODO: Execute a callback upon connection is established, or after
    //   exceeding the maximum number of attempts to connect to the server.

    if (typeof callback === "function") {
        client.on("error", ((err) => { callback(err); }));
        client.on("ready", (() => { callback(null, client); }));
    }

    return (client);
}

/**
 * @param topicName {string}
 * @param cb        {function(err: Error?, value: string?, notification: TopicNotification?):void}
 * @param timeout   {number}
 * @param hostname  {string}
 * @param port      {number}
 * @param keepAlive {boolean}
 */
export function retrieve(
    topicName,
    cb,
    timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT,
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
    keepAlive = false
) {
    let client = new MediatorClient({
        hostname,
        port,
        wildcard: "",
        connectNow: true
    });
    // FIXME: Should timeout include connection establishment time?
    client.onConnected((() => {
        client.retrieve(topicName, null, ((...args) => {
            if (!keepAlive) {
                client.disconnect();
            }
            try {
                cb(...args);
            } catch (e) {
                console.error(e);
            }
        }), timeout);
    }), true);
    return client;
}

/**
 * @param topicName {string}
 * @param cb        {function(err: Error?, value: string?, notification: TopicNotification?):void}
 * @param timeout   {number}
 * @param hostname  {string}
 * @param port      {number}
 *
 * @returns         {Promise<string>}
 */
export function retrieveAsync(
    topicName,
    cb,
    timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT,
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT
) {
    return new Promise((res, rej) => {
        let fn = ((err, value) => {
            if (err) {
                rej(err);
                return;
            }
            res(value);
        });
        retrieve(topicName, fn, timeout, hostname, port, false);
    });
}

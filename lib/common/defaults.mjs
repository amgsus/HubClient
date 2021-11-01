/*
 * Author: A.G.
 *   Date: 2020/01/23
 */

import {
    stringify,
    STRINGIFY_DEFAULTS
} from "./../utils/stringify.mjs";

// -----------------------------------------------------------------------------

/**
 * @typedef HubClientSettings
 * @type {object}
 *
 * @property {string} [host]
 *      The IP-address or the name of a remote host (default: "localhost").
 *
 * @property {number} [port]
 *      Remote port (default: 7777).
 *
 * @property {boolean} [connectNow]
 *      Specifies if a connection should be established upon instance
 *      initialization (default: true).
 *
 * @property {string} [namespace]
 *      Prefix for variables names (except a case when variable names starts
 *      with "#" or "!") (default: "").
 *
 * @property {*} [tag]
 *      Can be anything you want (default: null).
 *
 * @property {string}   [encoding]
 *      Sets the encoding of socket data flow (default: "utf8").
 *
 * @property {function(string):string} [stringify]
 *      A function used to convert values before sending it to the
 *      remote host (default: stringifyAll).
 *
 * @property {function(*)} [print]
 *      Printer function used for printing text to the console (default: console.log).
 *
 * @property [reconnectInterval] {number|string}
 *      Specifies the interval between attempts to reconnect to the remote
 *      host (default: 5000). TODO: "auto"
 *
 * @property [maxConnectAttempts] {number}
 *      Specifies the number of attempts of connection establishment before
 *      actual 'error' emitted. Zero or values below it disable this
 *      feature (default: -1).
 *
 * @property [mask] {string}
 *      Specifies a wildcard for update notifications from the server. Empty
 *      value disables all notifications (default: "").
 *
 * @property [listOnConnect] {string|boolean}
 *      Specifies a wildcard for requesting variables upon connection to the
 *      Hub instance is established. Empty value (or any negatively
 *      evaluated value) disables this feature (default: "").
 *
 * @property [queue] {string}
 *      TODO:
 *      1. none 2. evicting 3. fixed 4. evicting-set
 *
 * @property {boolean} [namespaceTrimming=true]
 *
 * @property [eol] {string}
 *      Specifies EOL sequence for a client. Defaults to "\r\n".
 *
 * @property [fixedRecoveryIntervals] {boolean}
 *
 * @property [strictUpdateEvents] {boolean}
 *
 *
 * @property [timeoutExecute] {number}
 * @property [timeoutRetrieve] {number}
 *
 *
 *
 *
 * @property {boolean}  [rawMode]
 *      In raw mode, all features, {@link HubClient#execute} method and
 *      timestamps are disabled. This can be used to guard communication and
 *      restrict it to simple "Key=Value" way.
 *
 * @property {string}   [namespaceDelimiter]
 *      Specifies namespace delimiter, which applied or removed from key names,
 *      when {@link HubClientSettings#namespace} is set.
 *
 * @property {string}   [timestampMode]
 *      Enables timestamping for values. This parameter can take following
 *      values: "none"/"", "abs" (absolute) and "rel" (relative).
 *      Default: "" (no timestamp).
 *
 * @property {boolean}  [autoTimestamp]
 *      Enables auto-addition of timestamps to values when storing them on
 *      server. Depending on {@link HubClientSettings#timestampMode},
 *      client adds relative or absolute timestamp. If timestamp is already
 *      specified, then client passes it to next processing stage.
 *
 * @property {boolean}  [debugging]
 */

// -----------------------------------------------------------------------------

/**
 * @type {HubClientSettings}
 */
export const HUB_CLIENT_DEFAULTS = Object.freeze({
    host: "localhost",
    port: 7778,
    connectNow: false,
    namespace: "",
    tag: null, // User-defined.
    rawMode: false,
    encoding: "ascii",
    stringify: stringify.bind(null, STRINGIFY_DEFAULTS),
    timestampMode: "none",
    debugging: false,
    print: null,
    retryInterval: 1000,
    maxConnectAttempts: -1,
    mask: "",
    listOnConnect: "",
    bypassSocketExceptions: true,
    namespaceTrimming: true,
    queue: "none",
    maxQueueSize: 20,
    eol: "\r\n",
    fixedRecoveryIntervals: false,
    strictUpdateEvents: false,
    namespaceDelimiter: ".",
    timeoutExecute: 3000, // TODO: Not used.
    timeoutRetrieve: 2500, // TODO: Not used.
    autoTimestamp: true,
    allowReceivedEmpties: false
});

export const CLIENT_DEFAULT_RETRIEVE_TIMEOUT = HUB_CLIENT_DEFAULTS.retrieveTimeout; // TODO: Move to parameters.
export const MIN_RECOVERY_INTERVAL = 0; // TODO: Pass as parameter.
export const MAX_RECOVERY_INTERVAL = 5000; // TODO: Pass as parameter.

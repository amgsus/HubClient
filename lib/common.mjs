/*
 * By:              A.G.
 * Created:         2020.01.23
 * Last modified:   2020.02.11
 */

import { stringify } from "./stringify.mjs";

// ----------------------------------------------------------------------------

/**
 * The MediatorClient constructor parameter type definition.
 *
 * @typedef MediatorClientSettings
 * @type {object}
 *
 * @property {string} [hostname]
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
 * @property {boolean} [rawMode]
 *      Specifies if control commands (starting with '#') are suppressed from
 *      being sent to the remote host (server) when connection is
 *      established. If this option is enabled, timestamp mode
 *      is forced to "none" (default: false).
 *
 * @property {string} [encoding]
 *      Sets the encoding of socket data flow (default: "utf8").
 *
 * @property {function(string):string} [stringify]
 *      A function used to convert values before sending it to the
 *      remote host (default: stringifyAll).
 *
 * @property {string} [tsMode]
 *      Specifies the desired format of timestamps. Possible values: "none",
 *      "abs", "rel". Default: "none".
 *
 * @property {boolean} [printMessages]
 *      Allows the client to print events into the console (default: true).
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
 * @property [wildcard] {string}
 *      Specifies a wildcard for update notifications from the server. Empty
 *      value disables all notifications (default: "").
 *
 * @property [listOnConnect] {string|boolean}
 *      Specifies a wildcard for requesting variables upon connection to the
 *      Mediator instance is established. Empty value (or any negatively
 *      evaluated value) disables this feature (default: "").
 *
 * @property [queueType] {string}
 *      TODO:
 *      1. none 2. evicting 3. fixed 4. evicting-set
 *
 * @property {boolean} [namespaceTrimming=true]
 *
 * @property [nickname] {string|null}
 *      Sets a name for a client visible in Mediator's console. Helps to
 *      discover connection states of the clients.
 *
 * @property [eol] {string}
 *      Specifies EOL sequence for a client. Defaults to "\r\n".
 *
 * @property [fixedRecoveryIntervals] {boolean}
 *
 * @property [strictUpdateEvents] {boolean}
 *
 * @property [nsDelimiter] {string}
 *      A namespace delimiter used to split channel name into separate segments.
 *
 * @property [restrictedMode] {boolean}
 *      When a user enables restricted mode, {@link MediatorClient} keeps
 *      backward compatibility with an old-version of Mediator server by
 *      turning off some features, such as notifications, RPC, etc.
 */

// ----------------------------------------------------------------------------

/**
 * Default settings for MediatorClient (in case if a property is omitted in
 * the constructor parameter).
 *
 * @type {MediatorClientSettings}
 */
export const CLIENT_DEFAULTS = Object.freeze({
    hostname: "localhost",
    port: 7777,
    connectNow: true,
    namespace: "",
    tag: null,
    rawMode: false,
    encoding: "utf8",
    stringify,
    tsMode: "none",
    printMessages: true,
    print: undefined, // Keep undefined here.
    retryInterval: 1000,
    maxConnectAttempts: -1,
    wildcard: "",
    listOnConnect: "",
    queueType: "none",
    bypassSocketExceptions: true,
    namespaceTrimming: true,
    queueSize: 16,
    nickname: null,
    eol: "\r\n",
    fixedRecoveryIntervals: false,
    strictUpdateEvents: false,
    nsDelimiter: "."
});

export const NSDELIM                            = ".";
export const DEFAULT_HOSTNAME                   = CLIENT_DEFAULTS.hostname;
export const DEFAULT_PORT                       = CLIENT_DEFAULTS.port;
export const ABSMARK                            = "!";
export const FNMARK                             = "#";
export const EVENTMARK                          = "~";
export const CLIENT_DEFAULT_RETRIEVE_TIMEOUT    = 2500;
export const QUESTMARK                          = "?";

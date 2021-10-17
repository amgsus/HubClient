/*
 * Author: A.G.
 *   Date: 2018/06/02
 */

import { EventEmitter, once }        from "events";
import { createConnection }          from "net";
import { HubClientStreamParser }     from "./transform.mjs";
import { TopicNotification }         from "./wrappers/notification.mjs";
import { wrapPromiseInTimeout }      from "./utils/promiseTimeout.mjs";
import { normalizeTopicName }        from "./utils/normalize.mjs";
import { HubStorageQueue }           from "./utils/queue.mjs";

import {
    normalizeArgsToValueList,
    rav2s,
    resolveName,
    ensureEndsWith,
    deleteUndefinedFromObject,
    sliceCallbackWithTimeout,
    invokeCallbackOrReturnPromise,
    isTranslatableToString,
    createPromiseBasedOn, arrayDeleteItem
} from "./utils/utils.mjs";

import {
    HubClientError,
    ERR_CONNECTION_REQUIRED,
    ERR_REQ_SOCKET_CLOSE,
    ERR_INVALID_ARGUMENT,
    ERR_NOTIFICATION_TIMEOUT
} from "./common/error.mjs";

import {
    HUB_CLIENT_DEFAULTS,
    CLIENT_DEFAULT_RETRIEVE_TIMEOUT,
    MIN_RECOVERY_INTERVAL,
    MAX_RECOVERY_INTERVAL
} from "./common/defaults.mjs";

import {
    ABSNMARK,
    FNMARK,
    EVENTMARK,
    SINGLE_SPACE,
    QUESTMARK,
    ASTERISK
} from "./common/const.mjs";

// -----------------------------------------------------------------------------

export const CONNECTED    = Symbol("connected");
export const DISCONNECTED = Symbol("disconnected");
export const CONNECTING   = Symbol("connecting");

export const SUBSCRIBE_ALL = Symbol();
export const SUBSCRIBE_NONE = Symbol();

// Description matches field name in { HubClient.#timeouts }:
const TIM_CONNECT = Symbol("connect");
const TIM_RECONNECT = Symbol("reconnect");

export const QUEUE_NONE     = "";
export const QUEUE_EVICTING = "evicting";
export const QUEUE_FIXED    = "fixed";
export const QUEUE_HASHED   = "hashed";

/**
 * @emits connect
 * @emits close
 * @emits disconnect
 * @emits error
 * @emits update
 * @emits update:${topicName}
 * @emits call
 * @emits call:${procedureName}
 * @emits subscribe
 * @emits unsubscribe
 */
export class HubClient extends EventEmitter {

    #ee                 = new EventEmitter(); // Internal notification event bus.
    #attempt            = 0;
    #connected          = false;
    #disconnected       = false;
    #opts               = {};
    #immediateSubscribe = null;
    #timeouts           = {};
    #subscriptions      = [];
    #timeslots          = {};
    #socket             = null;
    #queue;

    #bypassSocketExceptions;
    #encoding;
    #eol;
    #fixedRecoveryIntervals;
    #host;
    #listOnConnect;
    #maxConnectAttempts;
    #namespace;
    #namespaceDelimiter;
    #maxQueueSize;
    #port;
    #rawMode;
    #retryInterval;
    #strictUpdateEvents;
    #timestampMode;
    #autoTimestamp;
    #userNotificationMask;
    #debug;
    #stringify; // Function.

    /**
     * When function is set, client prints errors and status messages using
     * this method. Error messages starts with "Error: ". If debugging is
     * enabled, then client prints debug messages too, starting them with
     * "Debug: ". The prototype of this function is similar to
     * {@link console.log}, except that CRLF is not added at end of message.
     *
     * @type function(...string):void
     */
    #print; // TODO

    constructor(opts) { super();
        // Remove all properties with undefined values.
        // Otherwise, Object.assign() below will also overwrite defaults.
        opts = !opts ? {} : deleteUndefinedFromObject(opts);

        this.#opts = {
            bypassSocketExceptions: this.#bypassSocketExceptions,
            encoding: this.#encoding,
            eol: this.#eol,
            fixedRecoveryIntervals: this.#fixedRecoveryIntervals,
            host: this.#host,
            listOnConnect: this.#listOnConnect,
            maxConnectAttempts: this.#maxConnectAttempts,
            namespace: this.#namespace,
            namespaceDelimiter: this.#namespaceDelimiter,
            port: this.#port,
            maxQueueSize: this.#maxQueueSize,
            rawMode: this.#rawMode,
            retryInterval: this.#retryInterval,
            strictUpdateEvents: this.#strictUpdateEvents,
            stringify: this.#stringify,
            tag: this.tag,
            mask: this.#userNotificationMask,
            print: this.#print,
            autoTimestamp: this.#autoTimestamp,
            debugging: this.#debug
        } = Object.assign({}, HUB_CLIENT_DEFAULTS, opts);

        if (typeof this.#stringify !== "function") {
            throw HubClientError.createCode(ERR_INVALID_ARGUMENT)
                .set("message", "'stringify' must be function");
        }

        if (this.#print && typeof this.#print !== "function") {
            throw HubClientError.createCode(ERR_INVALID_ARGUMENT)
                .set("message", "'print' must be function or undefined (null)");
        }

        this.#debug = this.#debug && this.#print ? (...s) => {
            this.#print("DEBUG:", ...s);
        } : null;

        this.#timestampMode = this.#rawMode || this.#timestampMode === "none" ? "" : opts.timestampMode;

        this.#ee.on("error", () => {}); // Trap for avoiding UncaughtExceptionHandler.

        if (this.#opts.queue === QUEUE_FIXED || this.#opts.queue === QUEUE_EVICTING || this.#opts.queue === QUEUE_HASHED) {
            this.#queue = new HubStorageQueue({
                type: this.#opts.queue,
                maxSize: this.#opts.maxQueueSize
            });
        }

        if (this.#opts.connectNow) {
            setImmediate(() => {
                this.connect();
            });
        }
    }

    /**
     * Establishes connection to server. If port and/or host are specified, then
     * these values overwrite respective properties. Timeout can be also applied
     * for Promise (set callback to {@link noCallback}). Either host or port
     * can be specified only.
     *
     * @returns Promise (if callback is not specified).
     */
    connect(
        port = null,
        host = null
    ) {
        let {
            args,
            callback,
            timeout
        } = sliceCallbackWithTimeout(arguments);

        switch (typeof args[0]) {
            case "number":
                this.setPort(args[0]);
                if (typeof args[1] === "string") {
                    this.setHost(args[1]);
                }
                break;
            case "string":
                this.setHost(args[0]);
                break;
        }

        if (callback === HubClient.noCallback) {
            callback = null; // Return Promise.
        }

        const connectInternal = (cb) => {
            if (this.getConnectionStatus() === DISCONNECTED) { // FIXME: Possibly this have to be moved to upper level (check Promise).
                this.#disarmTimeout(TIM_RECONNECT); // Set on socket close when the feature is enabled.

                this.#connected = false;
                this.#disconnected = false;

                this.#createConnection();

                if (timeout > 0) {
                    this.#armTimeout(TIM_CONNECT, async () => {
                        this.#disarmTimeout(TIM_CONNECT);
                        if (this.getConnectionStatus() !== CONNECTED) {
                            await this.#forceDisconnect(); // TODO: Stop recovery and terminate connection.
                            cb(HubClientError.create("Connection timeout (user-defined)")
                                .set("method", "connect").set("timeout", timeout));
                        }
                    }, timeout);
                }

                const addListener = () => {
                    once(this, "connect").then(() => cb(null, this)).catch((err) => {
                        if (err.method === "connect") {
                            cb(err);
                        } else {
                            addListener(); // Re-add listener if error is not related to connection.
                        }
                    });
                };

                addListener();
            } else {
                cb(HubClientError.create("Client is connecting or already connected")
                    .set("method", "connect"));
            }
        };

        return invokeCallbackOrReturnPromise(connectInternal, callback);
    }

    /**
     * Internal method. Used by {@link connect} and connection recovery
     * mechanism to create socket.
     */
    #createConnection() {
        this.#socket = createConnection({ host: this.#host, port: this.#port });
        this.#socket.on("connect", this.#onConnect.bind(this))
            .on("close", this.#onDisconnect.bind(this)).on("error", this.#onSocketError.bind(this));
    }

    /**
     * Fired by socket when connection has been established.
     */
    #onConnect() {
        this.#disarmTimeout(TIM_CONNECT);
        this.#socket.pipe(new HubClientStreamParser()
            .on("data", this.#onPacketReceived.bind(this)));
        this.#attempt = 0; // Reset reconnect counter.
        this.#connected = true; // Flag established connection.
        if (!this.#rawMode) {
            this.#updateNotifications();
            this.updateTimestampMode(this.#timestampMode);
            this.#doListOnConnect();
        }
        this.#flushQueue();
        this.emit("connect", this);
    }

    /**
     * Fired by socket when connection becomes closed (either client
     * disconnected, or connection is lost). Implements connection recovery
     * functionality.
     */
    #onDisconnect() {
        // if (this.#printingMessages) {
        //     if (this.#disconnected) {
        //         // this.__log(`Disconnected`);
        //     } else if (this.#connected) {
        //         // this.__log(`Connection is closed by remote server`);
        //     }
        // }

        if (!(this.#disconnected)) {
            // Connection auto-recovery feature.

            // maxConnectAttempts:
            //      N>1 -> Tries to reconnect N-1 times before throwing an error.
            //      N=1 -> Immediately throws an error if connection fails.
            //      N<1 -> Reconnection attempts are not limited.

            this.#attempt++;
            if (this.#maxConnectAttempts < 1 || this.#attempt < this.#maxConnectAttempts) {
                let retryIn;
                if (this.#fixedRecoveryIntervals) {
                    retryIn = this.#retryInterval;
                } else {
                    retryIn = Math.min(MAX_RECOVERY_INTERVAL,
                        MIN_RECOVERY_INTERVAL + this.#retryInterval * (this.#attempt - 1));
                }
                // if (this.#printingMessages) {
                //     let s = ``;
                //     if (this.#maxConnectAttempts > 1) {
                //         s = ` (attempt ${this.#attempt + 1} of ${this.#maxConnectAttempts})`;
                //     }
                //     // this.__log(`Recovering connection in ${retryIn} ms${s}...`);
                // }
                this.#armTimeout(TIM_RECONNECT, this.#createConnection.bind(this), retryIn);
            } else {
                let msg = `Exceeded connection attempt limit`;
                // if (this.#printingMessages) {
                //     let s = ``;
                //     if (this.#maxConnectAttempts >= 1) {
                //         s = ` (max. ${this.#maxConnectAttempts})`;
                //     }
                //     // this.#print(`ERROR: Failed to establish connection: ${msg}${s}`);
                // }
                let errEvent = HubClientError.create(msg).set(`maxAttempts`, this.#maxConnectAttempts).set("method", "connect");
                this.#ee.emit(`error`, errEvent);
                this.emit(`error`, errEvent);
            }
        }

        if (this.#attempt <= 1) { // Emit a disconnect event only once the socket is closed.
            this.#ee.emit(`error`, HubClientError.create(`Socket closed`)); // Notify all pending callbacks that the client became offline.
            this.emit(`close`, this.#disconnected);
            this.emit(`disconnect`, this.#disconnected);
        }

        this.#socket = null;
        this.#connected = false;
    }

    /**
     * Fired by socket when error occurs.
     */
    #onSocketError(e) {
        // Push socket errors to the upper level?
        const msg = `Socket raised exception`;
        // if (this.#printingMessages) {
        //     // this.__log(`ERROR: ${msg}:`, e.message);
        // }
        if (this.#bypassSocketExceptions) {
            if (e.code !== "ECONNREFUSED" && e.code !== "ECONNRESET" && e.code !== "__DISCONNECT__") { // Do not throw these errors, let to reconnect.
                let errEvent = HubClientError.create(msg).set("cause", e);
                this.#ee.emit("error", errEvent);
                this.emit("error", errEvent);
            }
        }
    }

    /**
     * Throws error if client is not connected.
     */
    #assertConnection() {
        if (!this.connected) {
            throw HubClientError.createCode(ERR_CONNECTION_REQUIRED);
        }
    }

    #armTimeout(symbol, handler, timeout) {
        let name = symbol.description;
        if (this.#timeouts[name]) {
            throw HubClientError.create(`Timeout already armed: ${name}`);
        }
        this.#timeouts[name] = setTimeout(() => {
            this.#timeouts[name] = null;
            setImmediate(handler);
        }, timeout);
    }

    #disarmTimeout(symbol) {
        let name = symbol.description;
        if (this.#timeouts[name]) {
            clearTimeout(this.#timeouts[name]);
            this.#timeouts[name] = null;
        }
    }

    /**
     * @param packet.mod    {string}
     * @param packet.key    {string}
     * @param packet.id     {string}
     * @param packet.value  {string}
     * @param packet.ts     {string}
     * @private
     */
    #onPacketReceived(packet) { // TODO: Refactor?
        let data  = {
            id: this.#rawMode ? packet.key : packet.id, // TODO: Note key and id. Refactoring needed.
            isRequest: packet.q,
            mod: packet.mod,
            value: packet.value,
            ts: packet.ts || 0,
            namespace: ""
        };
        data.name = data.id; // Legacy.
        if (this.#namespace !== "") {
            const prefix = `${this.#namespace}${this.#namespaceDelimiter}`;
            if (data.id.startsWith(prefix)) {
                data.namespace = this.#namespace;
                data.id = data.id.slice(prefix.length);
            }
        }
        if (packet.mod && !this.#rawMode) {
            if (packet.mod === "#") {
                // Nothing.
            }
        } else {
            this.fireUpdate(new TopicNotification(data.id, data.value,
                Number(data.ts), data.namespace, this.#namespaceDelimiter));
        }
    }

    /**
     * Notifies listeners about value update. User can use this method to
     * simulate update event.
     */
    fireUpdate(notifs) {
        this.#ee.emit(`n:${notifs.absoluteName}`, notifs); // Internal.
        this.emit("update", notifs); // User global.
        if (!(notifs.namespace && this.#strictUpdateEvents)) {
            this.emit(`update:${notifs.name}`, notifs); // User specific.
        }
    }

    /**
     * Stops connection recovery and closes active/pending connection. Client
     * invokes specified callback when connection has been closed. Graceful
     * close helps to ensure that all data is sent to server before connection
     * is fully closed.
     *
     * @returns Promise (if callback is not specified).
     */
    disconnect(gracefulClose = true, callback = null) { // TODO: gracefulClose
        const disconnectInternal = (cb) => {
            let immediate = true;
            if (this.getConnectionStatus() !== DISCONNECTED) {
                this.#disconnected = true; // Suppresses connection recovery when Socket#close event is fired later.
                if (this.#queue) {
                    this.#queue.clear();
                }
                if (this.#socket) {
                    this.#socket.once("close", () => cb());
                    this.#socket.destroy();
                    immediate = false;
                }
            }
            if (immediate) {
                cb();
            }
        };

        return invokeCallbackOrReturnPromise(disconnectInternal, callback);
    }

    #forceDisconnect() {
        if (this.#socket) {
            console.log("Destroying socket");
            this.#socket.destroy();
        }
        this.#disarmTimeout(TIM_RECONNECT);
        this.#disconnected = true;
    }

    /**
     * Executes command on server (commands start with "#"). Arguments should
     * be of string type, otherwise, they converted explicitly to string using
     * stringify method, specified in client constructor.
     */
    execute(
        command
    ) {
        let {
            args,
            callback,
            timeout
        } = sliceCallbackWithTimeout(arguments, 1);

        if (!command || typeof command !== "string") {
            throw HubClientError.createCode(ERR_INVALID_ARGUMENT).set("argument", "command");
        }

        let executeImpl = (cb) => {
            this.#assertConnection();
            if (args.length > 0) {
                args = args.slice(1);
            }
            let value = args.map(this.#stringify).join(SINGLE_SPACE);
            let tuple = {
                key: `${FNMARK}${command}`,
                value
            };
            this.#writeSerialized(tuple, (err) => {
                cb(err, tuple);
            });
        };

        return invokeCallbackOrReturnPromise(executeImpl, callback);
    }

    #flushQueue() {
        if (this.#queue) {
            this.#assertConnection();
            this.#queue.forEach((item) => this.#writeSerialized(item, item.callback));
            this.#queue.clear();
        }
    }

    /**
     * @returns One of following: CONNECTING, CONNECTED or DISCONNECTED.
     */
    getConnectionStatus() {
        if (this.#socket === null) {
            return DISCONNECTED;
        } else {
            return this.#connected ? CONNECTED : CONNECTING;
        }
    }

    resolveName(keyName) {
        return resolveName(keyName, this.#namespace, this.#namespaceDelimiter);
    }

    /**
     * Requests server to list all stored keys matching specified pattern.
     */
    list(mask = "*") {
        return this.execute("list", mask);
    }

    updateTimestampMode(format) {
        return this.execute("timestamp", format);
    }

    get connected() { return this.getConnectionStatus() === CONNECTED; }

    #doListOnConnect() {
        if (!this.#listOnConnect) {
            return;
        }
        let mask;
        try {
            mask = normalizeTopicName(this.#listOnConnect, this.#namespaceDelimiter);
        } catch (e) {
            mask = "*";
        }
        this.list(mask);
    }

    /**
     * Optimizes list of subscriptions by removing duplicate entries
     * or replacing all with "*" when it is presented.
     *
     * @private
     */
    #optimizeSubscriptions() {
        let asterisk = 0;
        let reducedSet = this.#subscriptions.reduce(((set, itm) => {
            if (itm.trim() === "*") {
                asterisk = 1;
            }
            if (typeof set[itm] === "undefined") {
                set[itm] = 1;
            }
            return set;
        }), {});
        this.#subscriptions = asterisk ? [ "*" ] : Object.keys(reducedSet);
    }

    /**
     * Retrieves value from server, or creates new one with specified value if
     * such key does not exist. Callback is called for notification for this
     * key, or when timeout is reached.
     *
     * @returns Promise (if callback is not specified).
     */
    retrieve(
        keyName,
        defaultValue = null
    ) {
        let {
            args,
            callback,
            timeout
        } = sliceCallbackWithTimeout(arguments, 1); // keyName is guarded.

        let retrieveInternal = (cb) => {
            this.#assertConnection();

            keyName = args[0];
            defaultValue = args[1];

            if (!keyName || typeof keyName !== "string") {
                throw HubClientError.createCode(ERR_INVALID_ARGUMENT);
            }

            let absoluteName = resolveName(keyName, this.#namespace, this.#namespaceDelimiter);
            let query = ensureEndsWith(absoluteName, QUESTMARK);

            this.#writeSerializedOrEnqueue({ // Potential fail if client is disconnected?
                key: query,
                value: defaultValue,
                callback: (errIO) => {
                    if (errIO) {
                        cb(errIO);
                    } else {
                        this.awaitNotificationOrThrow(keyName, cb, timeout);
                    }
                }
            });
        };

        if (callback === HubClient.noCallback) {
            callback = null;
        }

        return invokeCallbackOrReturnPromise(retrieveInternal, callback);
    }

    resetTimestamp(...keyNames) { // ("") ([]) (KEY_ALL)
        if (keyNames[0] === null) {
            this.#timeslots = {};
        } else {
            keyNames.forEach((s) => {
                delete this.#timeslots[s];
            });
        }
    }

    /**
     * Stores value (or multiple values) on server. This method accepts three
     * forms of argument list. Optionally, user may specify callback to invoke
     * right after value is finally written out to socket. Single callback is
     * applied to all specified values. This method accepts
     * {@link HubClient#noCallback} as callback for preventing creation of
     * undesired Promise's.
     */
    store(...args) {
        let {
            args: argsWithoutCallback,
            callback
        } = sliceCallbackWithTimeout(arguments);

        let storeImpl = (cb) => {
            if (!this.#queue) {
                this.#assertConnection();
            }

            let now = Date.now();
            let valueList = normalizeArgsToValueList(argsWithoutCallback);

            for ( let item of valueList ) {
                this.#storeInternal(item, now, cb);
            }
        };

        if (callback === HubClient.noCallback) {
            callback = null;
        }

        return invokeCallbackOrReturnPromise(storeImpl, callback);
    }

    /**
     * Stores value (or multiple values) on server. Callback is resolved when
     * all values are handled, i.e. finally written out to socket (this behavior
     * differs from {@link HubClient#store}).
     */
    storeAll(...args) {
        if (!this.#queue) {
            this.#assertConnection();
        }

        let {
            args: argsWithoutCallback,
            callback
        } = sliceCallbackWithTimeout(arguments);

        let now = Date.now();
        let valueList = normalizeArgsToValueList(argsWithoutCallback);

        let allPromises = valueList.map((item) => createPromiseBasedOn((cbItem) => {
            this.#storeInternal(item, now, cbItem);
        }));

        let promise = Promise.allSettled(allPromises);

        if (typeof callback === "function") {
            promise.then(callback).catch(callback);
        } else {
            return promise;
        }
    }

    /**
     * Internal usage.
     */
    #storeInternal(item, now, callback) {
        let s = normalizeTopicName(item.key, this.#namespaceDelimiter);
        let xx = {
            key: resolveName(s, this.#namespace, this.#namespaceDelimiter),
            value: this.#stringify(item.value),
            ts: undefined,
            callback: (err) => callback(err, item)
        };
        if (this.#timestampMode) { // Timestamps enabled?
            if (typeof item.ts === "number") { // If presented, then just copy.
                xx.ts = item.ts;
            } else if (this.#autoTimestamp) { // Auto-adds timestamp if option is enabled.
                if (this.#timestampMode === "abs") {
                    xx.ts = now;
                } else if (this.#timestampMode === "rel") {
                    if (this.#timeslots[xx.key] || this.#timeslots[xx.key] === 0) { // Defined?
                        xx.ts = now - this.#timeslots[xx.key];
                    } else {
                        xx.ts = 0; // Begin relative timestamping.
                    }
                    this.#timeslots[xx.key] = now;
                }
            }
        }
        this.#writeSerializedOrEnqueue(xx);
    }

    /**
     * Write data to socket. Invokes callback when data is finally written out,
     * which may not be immediately. Timeout is ignored.
     */
    write(...data) {
        this.#assertConnection();

        let {
            args,
            callback
        } = sliceCallbackWithTimeout(arguments, 1);

        args = args.filter(isTranslatableToString);
        let [ lastChunk ] = args.splice(-1, 1);

        let writeInternal = (cb) => {
            try {
                args.forEach((chunk) => {
                    this.#writeChunk(chunk);
                });
                this.#writeChunk(lastChunk, cb); // FIXME: Do for all, or only for last one?
            } catch (e) {
                cb(e);
            }
        };

        return invokeCallbackOrReturnPromise(writeInternal, callback);
    }

    /**
     * Internal usage. Follows asynchronous behavior for callback invocation
     * similar to {@link Writable#write} method.
     */
    #writeSerializedOrEnqueue(item) {
        if (this.connected) {
            this.#writeSerialized(item, item.callback);
        } else {
            if (this.#queue) {
                this.#queue.add(item);
            }
        }
    }

    /**
     * Internal usage.
     */
    #writeSerialized(obj, callback = null) {
        let kv = rav2s(obj);
        let chunk = `${kv}${this.#eol}`;
        return this.#writeChunk(chunk, callback);
    }

    /**
     * Internal usage.
     */
    #writeChunk(chunk, callback = null) {
        return this.#socket.write(chunk, this.#encoding, callback);
    }

    /**
     * Appends subscription list with specified keys. Optionally, handler can
     * be attached for update notification. Subscription list is kept persistent
     * between re-connections.
     */
    subscribe(
        keyName,
        handler = null
    ) {
        let {
            args: argsWithoutCallback,
            callback
        } = sliceCallbackWithTimeout(arguments, 1);

        keyName = argsWithoutCallback[0];

        if (keyName === SUBSCRIBE_ALL) {
            this.#subscriptions = [ ASTERISK ];
        } else if (keyName === SUBSCRIBE_NONE) {
            this.#subscriptions = [];
        } else if (typeof keyName === "string") {
            this.#subscribeInternal(keyName, callback);
        } else if (typeof keyName === "object") {
            this.#subscribeInternal(keyName.key, keyName.callback);
        } else {
            throw HubClientError.create(`Invalid parameter (type=${typeof keyName})`);
        }
    }

    #subscribeInternal(keyName, callback) {
        let resolvedName = this.resolveName(keyName);
        this.#subscriptions.push(resolvedName);
        if (typeof callback === "function") {
            this.on(`update:${keyName}`, callback);
        }
        this.#scheduleUpdateNotificationMask();
    }

    /**
     * Removes key(s) from subscription list and updates notification mask.
     * This method does not remove update listeners from event emitter.
     */
    unsubscribe(...args) {
        let updated = false;
        for ( let keyName of args ) {
            if (arrayDeleteItem(this.#subscriptions, keyName)) {
                updated = true;
            }
        }
        if (updated) {
            this.#scheduleUpdateNotificationMask();
        }
    }

    /**
     * Internal usage.
     */
    #scheduleUpdateNotificationMask() {
        if (!this.#immediateSubscribe) {
            clearImmediate(this.#immediateSubscribe);
        }
        this.#immediateSubscribe = setImmediate(this.#updateNotifications.bind(this));
    }

    /**
     * Executes "notify" command.
     * @returns {HubClient} Returns this object.
     */
    #updateNotifications() { // TODO: Add callback.
        this.#immediateSubscribe = null;
        this.#optimizeSubscriptions();
        let joinedString = this.#subscriptions.join(" ");
        return this.execute("notify", `${this.#userNotificationMask} ${joinedString}`.trim());
    }

    /**
     * Returns a promise which will be resolved as soon as the client
     * establishes the connection to the server.
     *
     * @param timeout   {number}
     *      Any positive value greater than 0 sets the timeout in
     *      milliseconds. If zero is specified, then the method returns a
     *      promise that is resolved immediately if the client is already
     *      connected to the server, or is rejected if not. Any negative value
     *      is treated as infinite timeout.
     *
     * @returns         {Promise<HubClient>}
     */
    awaitConnect( // TODO: Handle emitted errors.
        timeout = -1
    ) {
        if (this.connected) {
            return Promise.resolve(this);
        } else if (timeout !== 0) {
            let p = once(this, "connect");
            return timeout > 0 ? wrapPromiseInTimeout(p, timeout) : p;
        }
        return Promise.reject(HubClientError.create("Not connected"));
    }

    /**
     * Waits for update notification of value. Callback is invoked once update
     * received, or timeout is reached. Client fires callback if connection is
     * lost or client has disconnected. Returns notification, received right
     * after call.
     *
     * @returns Promise (if callback is not specified).
     */
    awaitNotification(
        keyName
    ) {
        this.#assertConnection();

        const timeoutArgsSupplier = () => {
            return [ null, null ];
        };

        return this.#awaitNotificationInternal(timeoutArgsSupplier, ...arguments);
    }

    /**
     * Waits for update notification of value. Callback is invoked once update
     * received, or timeout is reached. Client fires callback if connection is
     * lost or client has disconnected. Returns notification, received right
     * after call.
     *
     * @returns Promise (if callback is not specified).
     */
    awaitNotificationOrThrow(
        keyName
    ) {
        this.#assertConnection();

        const timeoutArgsSupplier = (eventName) => {
            return [
                HubClientError.createCode(ERR_NOTIFICATION_TIMEOUT)
                    .set("method", "awaitNotificationInternal")
                    .set("eventName", eventName)
            ];
        };

        return this.#awaitNotificationInternal(timeoutArgsSupplier, ...arguments);
    }

    /**
     * Internal usage. Waits for any notification of value, before timeout is
     * reached.
     */
    #awaitNotificationInternal(
        timeoutArgsSupplier,
        keyName
    ) {
        let {
            args,
            callback,
            timeout
        } = sliceCallbackWithTimeout(arguments, 2);

        keyName = args[1];

        if (!keyName || typeof keyName !== "string" || !(keyName = keyName.trim())) {
            throw HubClientError.create(ERR_INVALID_ARGUMENT)
                .set("argument", "keyName");
        }

        if (callback === HubClient.noCallback) {
            callback = null; // Return Promise.
        }

        keyName = resolveName(keyName, this.#namespace, this.#namespaceDelimiter);

        let eventName = `n:${keyName}`;
        let tout = null;

        const clearTimeoutHere = () => {
            if (tout) {
                clearTimeout(tout);
                tout = null;
            }
        };

        const impl = (cb) => {
            let errorHandler = null;
            let eventHandler = ((notif) => {
                this.#ee.off("error", errorHandler);
                clearTimeoutHere();
                cb(null, notif);
            });

            errorHandler = ((err) => {
                this.#ee.off(eventName, eventHandler);
                clearTimeoutHere();
                cb(err);
            });

            this.#ee.once("error", errorHandler);
            this.#ee.once(eventName, eventHandler);

            if (timeout > 0) {
                tout = setTimeout(() => {
                    this.#ee.off("error", errorHandler);
                    this.#ee.off(eventName, eventHandler);
                    cb(...timeoutArgsSupplier(eventName));
                }, timeout);
            }
        };

        return invokeCallbackOrReturnPromise(impl, callback);
    }

    static #assertType(value, type, argName) {
        let t = typeof value;
        if (t !== type) {
            throw HubClientError.createCode(ERR_INVALID_ARGUMENT).set("argument", argName).set("desiredType", type);
        }
    }

    get host() { return this.#host; }

    setHost(host) {
        if (this.getConnectionStatus() === DISCONNECTED) {
            if (typeof host === "string") {
                host = host.trim();
                if (host) {
                    this.#host = host;
                    return this;
                }
            }
            throw HubClientError.create(ERR_INVALID_ARGUMENT)
                .set("method", "setHost");
        }
        throw HubClientError.create(ERR_REQ_SOCKET_CLOSE)
            .set("method", "setHost");
    }

    get port() { return this.#port; }

    setPort(port) {
        if (this.getConnectionStatus() === DISCONNECTED) {
            if (typeof port === "number") {
                port = Math.trunc(port);
                if (port && port <= 65535) {
                    this.#port = port;
                    return this;
                }
            }
            throw HubClientError.create(ERR_INVALID_ARGUMENT)
                .set("method", "setPort");
        }
        throw HubClientError.create(ERR_REQ_SOCKET_CLOSE)
            .set("method", "setPort");
    }

    static #th(message, cause = null) {
        throw HubClientError.create(message).set('cause', cause);
    }

    /**
     * Factory method.
     *
     * @param opts {HubClientSettings}
     * @returns {HubClient}
     */
    static create(opts) {
        return new HubClient(opts);
    }

    /**
     * Fabric method. Create client instance and immediately connect to
     * specified server (or using default settings if port and host are not
     * specified).
     *
     * @returns {NodeJS.Global.Promise<HubClient>}
     */
    static connect(port = null, host = null) {
        return new HubClient().connect(port, host);
    }

    /**
     * Fabric method. Create client instance and immediately connect to
     * specified server (or using default settings if port and host are not
     * specified). When using this method, client makes only single attempt
     * establishing connection to server.
     *
     * @returns {NodeJS.Global.Promise<HubClient>}
     */
    static connectNow(port = null, host = null) {
        let opts = {
            maxConnectAttempts: 1 // Once.
        };
        return new HubClient(opts).connect(port, host);
    }

    /**
     * Use this static method to pass as callback in "promisable" methods, when
     * Promise is wanted to be returned along with set timeout for operation.
     * Do not use binding.
     */
    static noCallback() {} // Example: await client.connect(HubClient.noCallback, 5000);
}

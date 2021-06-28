/*
 * By:              A.G.
 * Created on:      2018.06.02
 * Last modified:   2020.07.19
 */

import { EventEmitter, once }   from "events";
import { createConnection }     from "net";
import { MediatorStreamParser } from "./transform.mjs";
import { TopicNotification }    from "./notification.mjs";
import { Topic }                from "./topic.mjs";
import { wrapPromiseInTimeout } from "./promiseTimeout.mjs";
import { normalizeTopicName }   from "./normalize.mjs";
import * as Utils               from "./utils.mjs";

// import {
//     addSlashes,
//     stripSlashes
// } from "slashes/lib/index.js";

import {
    popCallback,
    normalizeRavToList,
    rav2s,
    cloneVariable,
    ff,
    resolveNamespace,
    defaultPrint,
    ensureEndsWith,
    deleteUndefinedFromObject
} from "./utils.mjs";

import {
    stringify,
    STRINGIFY_DEFAULTS
} from "./stringify.mjs";

import {
    ClientError,
    ClientTimeoutError,
    ClientIllegalStateError,
    ClientInvalidParameterError
} from "./error.mjs";

import {
    NSDELIM,
    ABSMARK,
    FNMARK,
    CLIENT_DEFAULTS,
    CLIENT_DEFAULT_RETRIEVE_TIMEOUT,
    EVENTMARK,
    QUESTMARK, DEFAULT_PORT, DEFAULT_HOSTNAME
} from "./common.mjs";

import {
    RPC_CODE_TO_TEXT_MAP,
    RPC_REGEX,
    RPC_RESULT_REGEX,
    RPC
} from "./rpc.mjs";

export { stringify, STRINGIFY_DEFAULTS };

const MEDIATOR_CLIENT_FEATURES = [ "events" ];

const CONNECTED    = "CONNECTED";
const DISCONNECTED = "DISCONNECTED";
const CONNECTING   = "CONNECTING";

const MIN_RECOVERY_INTERVAL = 0;
const MAX_RECOVERY_INTERVAL = 5000;

const TS_MODE_NONE     = "none";
const TS_MODE_ABSOLUTE = "abs";
const TS_MODE_RELATIVE = "rel";

const RPC_TIMEOUT = 5000;

/**
 * @emits ready
 * @emits connect
 * @emits online
 * @emits close
 * @emits disconnect
 * @emits offline
 * @emits error
 * @emits update
 * @emits update:${topicName}
 * @emits subscribe
 * @emits unsubscribe
 */
export class MediatorClient extends EventEmitter {

    #attempt                = 0;
    #bypassSocketExceptions = true;
    #connected              = false;
    #disconnected           = false;
    #encoding               = "utf8";
    #eol                    = "\r\n";
    #fixedRecoveryIntervals = false;
    #host                   = "localhost";
    #internalEE             = new EventEmitter();
    #listOnConnect          = false;
    #maxConnectAttempts     = -1;
    #namespace              = "";
    #nextRPCallID           = 0;
    #nickname               = "";
    #nsDelimiter            = ".";
    #offlineQueueSize       = 16;
    #opts                   = {};
    #paramChecks            = true;
    #pendingImmediate       = null;
    #pendingRPCs            = {};
    #pendingTimeout         = null;
    #port                   = 7777;
    #print;
    #printingMessages       = true;
    #queue                  = [];
    #queueType              = "none";
    #rawMode                = false;
    #restrictedMode         = false;
    #retryInterval          = 5000;
    #socket                 = null;
    #strictUpdateEvents     = true;
    #stringify;
    #subscriptions          = [];
    #timeslots              = {};
    #topics                 = {};
    #tsMode                 = "";
    #userNotificationMask   = "";
    tag;

    /**
     * @param [opts] {MediatorClientSettings}
     * @throws ClientInvalidParameterError
     */
    constructor(opts) { super();

        // Removes all undefined properties, otherwise Object.assign() will also replace defaults with them.
        opts = !opts ? {} : deleteUndefinedFromObject(opts);

        this.#opts = {
            bypassSocketExceptions: this.#bypassSocketExceptions,
            encoding: this.#encoding,
            eol: this.#eol,
            fixedRecoveryIntervals: this.#fixedRecoveryIntervals,
            hostname: this.#host,
            listOnConnect: this.#listOnConnect,
            maxConnectAttempts: this.#maxConnectAttempts,
            namespace: this.#namespace,
            nickname: this.#nickname,
            nsDelimiter: this.#nsDelimiter,
            port: this.#port,
            printMessages: this.#printingMessages,
            queueSize: this.#offlineQueueSize,
            queueType: this.#queueType,
            rawMode: this.#rawMode,
            restrictedMode: this.#restrictedMode,
            retryInterval: this.#retryInterval,
            strictUpdateEvents: this.#strictUpdateEvents,
            stringify: this.#stringify,
            tag: this.tag,
            wildcard: this.#userNotificationMask
        } = Object.assign({}, CLIENT_DEFAULTS, opts);

        this.#tsMode = this.#rawMode ? TS_MODE_NONE : opts.tsMode;
        this.#print = typeof opts.print === "function" ? opts.print : defaultPrint;

        this.#internalEE.on("error", (function () {})); // Uncaught error trap.

        this.rpc = this.invokeRPC; // Alias.

        if (this.#opts.connectNow) {
            this.connect(); // Throws if invalid parameters are set.
        }
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
     * @returns         {Promise<MediatorClient>}
     */
    awaitConnect(timeout = -1) { // TODO: Handle emitted errors.
        if (this.isReady()) {
            return Promise.resolve(this);
        } else if (timeout !== 0) {
            // let p = new Promise((resolve, reject) => {
            //     this.once(`ready`, (() => {
            //         resolve(this);
            //     }));
            // });
            let p = once(this, `ready`);
            return timeout > 0 ? wrapPromiseInTimeout(p, timeout) : p;
        }
        return Promise.reject(new Error(`Not connected`));
    }

    /**
     * Awaits a notification of topic publishment or timeout.
     *
     * @param name      {string}
     * @param cb        {function(error:Error?,notification:TopicNotification?):void}
     * @param timeout   {number}
     *
     * @returns         {undefined|Promise<TopicNotification>}
     *
     *      When a callback function is not specified, this method returns {@link Promise}.
     *
     */
    awaitNotification(
        name,
        cb = null,
        timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT
    ) {
        if (typeof name !== "string" || (name = name.trim()) === "") {
            MediatorClient.th("Name is not a string or is empty");
        }
        if (cb && typeof cb !== "function") {
            MediatorClient.th("Specified parameter is not a callback function");
        }
        if (typeof timeout !== "number" || timeout < 1) {
            MediatorClient.th("Timeout must be a number greater than 0");
        }
        let resolvedName = resolveNamespace(name, this.#namespace);
        if (cb) {
            this.__awaitNotificationUnsafe(resolvedName, timeout,
                ((error, notification) => {
                    try {
                        cb(error, notification);
                    } catch (e) {
                        console.error(e);
                    }
                }));
        } else {
            return new Promise((resolve, reject) => {
                this.__awaitNotificationUnsafe(resolvedName, timeout,
                    ((error, notification) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(notification);
                        }
                    }));
            });
        }
    }

    /**
     * The same as {@link MediatorClient#awaitNotification}, but returns a
     * {@link Promise} instead of invoking callback.
     *
     * This function also differs from {@link MediatorClient#awaitNotification}
     * in a way that it never throws if invalid parameters are specified.
     * Instead, it rejects the returned promise.
     *
     * @param name      {string}
     * @param timeout   {number}
     *
     * @returns         {Promise<TopicNotification>}
     */
    awaitNotificationAsync(
        name,
        timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT
    ) {
        return new Promise((resolve, reject) => {
            try {
                this.awaitNotification(name, ((error, notification) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(notification);
                    }
                }), timeout);
            } catch (e) { // Catches invalid parameter errors.
                reject(e);
            }
        });
    }

    /**
     * @param name      {string}
     *      The full name of the topic.
     * @param timeout   {number}
     * @param cb        {function(error:Error?,notification:TopicNotification?):void}
     *
     * @private
     */
    __awaitNotificationUnsafe(
        name,
        timeout,
        cb
    ) {
        let eventName = `n:${name}`;
        let ti;
        let errorHandler;
        let eventHandler = ((notif) => {
            this.#internalEE.off("error", errorHandler);
            if (ti) {
                clearTimeout(ti);
            }
            try {
                cb(null, notif);
            } catch (e) {
                console.error(`Callback error:`, e);
            }
        });
        ti = setTimeout((() => {
            this.#internalEE.off("error", errorHandler);
            this.#internalEE.off(eventName, eventHandler);
            try {
                cb(new ClientTimeoutError(`No notification for '${name}' is received`));
            } catch (e) {
                console.error(`Callback error:`, e);
            }
        }), timeout);
        errorHandler = ((error) => {
            this.#internalEE.off(eventName, eventHandler);
            if (ti) {
                clearTimeout(ti);
            }
            try {
                cb(error);
            } catch (e) {
                console.error(`Callback error:`, e);
            }
        });
        this.#internalEE.once("error", errorHandler);
        this.#internalEE.once(eventName, eventHandler);
    }

    /**
     * Establishes connection to the Mediator server.
     *
     * @param remoteHost  {string}
     *      Updates remote host address if the specified value can be evaluated
     *      as truth.
     *
     * @param port      {number}
     *      Updates remote port if the specified value can be evaluated
     *      as truth.
     *
     * @param cb        {function(error:Error?,client:MediatorClient?):void}
     *
     * @throws ClientIllegalStateError
     * @throws ClientInvalidParameterError
     */
    connect(
        remoteHost = "",
        port = 0,
        cb = null
    ) {
        if (this.getConnectionStatus() !== DISCONNECTED) {
            throw new ClientIllegalStateError("Client is connected(-ing)");
        }

        if (remoteHost) {
            if (typeof remoteHost !== "string") {
                throw new ClientInvalidParameterError("Host must be a string");
            }
            this.host = remoteHost.trim();
        }

        if (!this.#host) {
            throw new ClientInvalidParameterError("Host is not specified");
        }

        if (port) {
            this.port = Number(port);
        } else {
            this.#port = Number(this.#port);
        }

        if (!Number.isInteger(this.#port) || this.#port < 1 || this.#port > 65535) {
            throw new ClientInvalidParameterError("Port must be an integer in range [1..65535]");
        }

        if (this.#pendingTimeout) { // Set on socket close when the feature is enabled.
            clearTimeout(this.#pendingTimeout);
            this.#pendingTimeout = null;
        }

        if (this.#printingMessages) {
            this.__log(`Connecting to ${this.#host}:${this.#port}...`);
        }

        this.#connected = false;
        this.#disconnected = false;

        this.#socket = createConnection({ host: this.#host, port: this.#port });
        this.#socket.on("connect", this.__onConnect.bind(this))
            .on("close", this.__onDisconnect.bind(this)).on("error", this.__onSocketError.bind(this));

        if (typeof cb == "function") {
            once(this, "connect").then(() => cb(null, this)).catch((e) => cb(e));
        }
    }

    /**
     * Establishes connection to the Mediator server and returns {@link Promise}.
     *
     * @param remoteHost  {string}
     *      Updates remote host address if the specified value can be evaluated
     *      as truth.
     *
     * @param port      {number}
     *      Updates remote port if the specified value can be evaluated
     *      as truth.
     *
     * @returns         {Promise<MediatorClient>}
     *      {@link Promise} that is resolved as soon as connection to the server
     *      is established; and rejected in case if any error has occured (for
     *      example, the client reaches the reconnect attempt limit).
     */
    connectAsync(
        remoteHost = "",
        port = 0
    ) {
        return new Promise((res, rej) => {
            this.connect(remoteHost, port, ((err, client) => {
                if (err) {
                    rej(err);
                } else {
                    res(client);
                }
            }))
        });
    }

    /**
     * @private
     */
    __onConnect() {
        this.#socket.pipe(new MediatorStreamParser())
            .on("data", this.__onPacketReceived.bind(this));

        this.#attempt = 0; // Reset reconnect counter.
        this.#connected = true; // Flag established connection.

        if (this.#printingMessages) {
            this.#print(`OK! Connection to ${this.#host}:${this.#port} established`);
        }

        if (!(this.#rawMode)) {
            if (!(this.#restrictedMode)) {
                // Notify the server that this client supports features
                // such as events, RPC, etc.
                this.execute(`features`, MEDIATOR_CLIENT_FEATURES.join(" "));
            }
            this.__updateNotifications();
            this.execute("timestamp", this.#tsMode); // Configure preferable timestamp mode.
            if (typeof this.#nickname === "string" && (this.#nickname = this.#nickname.trim())) {
                this.identifyMe(this.#nickname);
            }
            this.__listOnConnect();
        }

        this.__flushQueue();

        this.emit("ready", this);
        this.emit("connect", this);
        this.emit("online", this);
    }

    /**
     * This method is invoked by Socket when it becomes closed.
     * @private
     */
    __onDisconnect() {
        if (this.#printingMessages) {
            if (this.#disconnected) {
                this.__log(`Disconnected`);
            } else if (this.#connected) {
                this.__log(`Connection is closed by remote server`);
            }
        }

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
                if (this.#printingMessages) {
                    let s = ``;
                    if (this.#maxConnectAttempts > 1) {
                        s = ` (attempt ${this.#attempt + 1} of ${this.#maxConnectAttempts})`;
                    }
                    this.__log(`Recovering connection in ${retryIn} ms${s}...`);
                }
                this.#pendingTimeout = setTimeout(this.connect.bind(this), retryIn);
            } else {
                let msg = `Exceeded connection attempt limit`;
                if (this.#printingMessages) {
                    let s = ``;
                    if (this.#maxConnectAttempts >= 1) {
                        s = ` (max. ${this.#maxConnectAttempts})`;
                    }
                    this.#print(`ERROR: Failed to establish connection: ${msg}${s}`);
                }
                let errEvent = ClientError.create(msg).set(`maxAttempts`, this.#maxConnectAttempts);
                this.#internalEE.emit(`error`, errEvent);
                this.emit(`error`, errEvent);
            }
        }

        if (this.#attempt <= 1) { // Emit a disconnect event only once the socket is closed.
            this.#internalEE.emit(`error`, ClientError.create(`Socket closed`)); // Notify all pending callbacks that the client became offline.
            this.emit(`close`, this.#disconnected);
            this.emit(`disconnect`, this.#disconnected);
            this.emit(`offline`, this.#disconnected);
        }

        this.#socket = null;
        this.#connected = false;
    }

    /**
     * @param packet.mod    {string}
     * @param packet.key    {string}
     * @param packet.id     {string}
     * @param packet.value  {string}
     * @param packet.ts     {string}
     * @private
     */
    __onPacketReceived(packet) { // TODO: Refactor?
        let data  = {
            id: this.#rawMode ? packet.key : packet.id,
            isRequest: packet.q,
            mod: packet.mod,
            value: packet.value,
            ts: packet.ts || 0,
            namespace: ""
        };
        data.name = data.id; // Legacy.
        if (this.#namespace !== "") {
            const prefix = `${this.#namespace}${NSDELIM}`;
            if (data.id.startsWith(prefix)) {
                data.namespace = this.#namespace;
                data.id = data.id.slice(prefix.length);
            }
        }
        if (packet.mod && !this.#rawMode) {
            let param = packet.value || "";
            switch (packet.key) {
                case "#rpc": // Request to me.
                    this.__handleRPCall(param);
                    break;
                case "#result": // Result of my request.
                    this.__handleRPCallResult(param);
                    break;
            }
        } else {
            this.__fireUpdate(new TopicNotification(data.id, data.value,
                Number(data.ts), data.namespace));
        }
    }

    /**
     * @param e {Error}
     * @private
     */
    __onSocketError(e) {
        // Push socket errors to the upper level?
        const msg = `Socket raised exception`;
        if (this.#printingMessages) {
            this.__log(`ERROR: ${msg}:`, e.message);
        }
        if (this.#bypassSocketExceptions) {
            if (e.code !== `ECONNREFUSED` && e.code !== `ECONNRESET` && e.code !== `__DISCONNECT__`) { // Do not throw these errors, let to reconnect.
                let errEvent = ClientError.create(msg).set(`cause`, e);
                this.#internalEE.emit(`error`, errEvent);
                this.emit(`error`, errEvent);
            }
        }
    }

    /**
     * @param notifs {TopicNotification}
     * @private
     */
    __fireUpdate(
        notifs
    ) {
        if (this.#topics[notifs.absoluteName]) {
            this.#topics[notifs.absoluteName].updateData(notifs.value, notifs.ts);
        }
        this.#internalEE.emit(`n:${notifs.absoluteName}`, notifs); // Internal.
        this.emit(`update`, notifs); // User global.
        if (!(notifs.namespace && this.#strictUpdateEvents)) {
            this.emit(`update:${notifs.name}`, notifs); // User specific.
        }
    }

    /**
     * @param msg {string}
     * @throws ClientError
     * @private
     */
    __checkConnected(msg = "This action is allowed only when connection is established") {
        if (!this.isReady()) {
            MediatorClient.th(msg);
        }
    }

    /**
     * @param name                  {string}
     *      Channel name. The name can include modifiers.
     * @param options
     *      Parameters passed to Topic constructor.
     * @param options.noSubscribe   {boolean}
     *      Tells the client not to subscribe to the specified channel.
     * @returns                     {Topic}
     */
    createTopic(
        name,
        options = {}
    ) {
        let absoluteName = resolveNamespace(name, this.#namespace);
        if (this.#topics[absoluteName]) {
            return this.#topics[absoluteName];
        }
        if (!(options.noSubscribe)) {
            this.subscribe(`${ABSMARK}${absoluteName}`);
        }
        this.#topics[absoluteName] = Object.seal(new Topic(this, absoluteName, options));
        if (this.#printingMessages) {
            this.__log(`Created topic: ${absoluteName}`);
        }
        return this.#topics[absoluteName];
    }

    /**
     * Similar to {@link MediatorClient#createTopic}, but configures Topic to
     * parse incomming JSON-data and stringify it on write.
     *
     * @param name          {string}
     *      The name of a channel.
     * @param [options={}]  {object}
     *      See {@link MediatorClient#createTopic} option parameter.
     *
     * @returns {Topic}
     */
    createJSONDataTopic(
        name,
        options = {}
    ) {
        let optionsRedefined = Object.assign({}, options, {
            serialize: JSON.stringify,
            deserialize: JSON.parse,
            type: "object"
        });
        return this.createTopic(name, optionsRedefined);
    }

    /**
     * Closes the connection and suppresses the connection recovery.
     *
     * @throws ClientIllegalStateError if the method is called on
     * disconnected client, or when the connection establishment is pending.
     */
    disconnect() {
        if (this.getConnectionStatus() !== CONNECTED) {
            throw new ClientIllegalStateError(`Client is already disconnected`);
        }
        setImmediate(() => {
            this.#disconnected = true; // Suppresses connection recovery when Socket#close event is fired later.
            this.#queue = [];
            this.#socket.destroy();
        });
    }

    /**
     * @private
     */
    __enqueueSend(data) {
        this.__w(data);
    }

    /**
     * TODO:
     * Executes a command on Mediator instance. A command name starts with '#' (added automatically if not specified).
     * @param name {string} The name of a command to execute.
     * @param params {*} The parameters of the command. The parameters are converted into a string of the specified parameters splitted by space character (decimal 32).
     */
    execute(name, ...params) {
        let paramsJoined = params.map(this.#stringify.bind(this)).join(" ");
        let command = name.startsWith(FNMARK) ? name : `${FNMARK}${name}`;
        this.__w({
            id: command,
            value: paramsJoined
        });
        return this;
    }

    /**
     * @private
     *
     * Writes collected data from the internal queue to the remote host. This
     * method should not be invoked on closed connection (otherwise, it will
     * re-add all enqueued items back to the internal queue).
     */
    __flushQueue() {
        const cloned = [ ...this.#queue ];
        this.#queue  = [];
        cloned.forEach((item) => {
            this.__w(item);
        });
    }

    /**
     * @returns {string} The one of the following strings: CONNECTING,
     * CONNECTED or DISCONNECTED.
     */
    getConnectionStatus() {
        if (this.#socket === null) {
            return DISCONNECTED;
        } else {
            return this.#connected ? CONNECTED : CONNECTING;
        }
    }

    __getUniqueRPCallID() {
        let id = this.#nextRPCallID;
        this.#nextRPCallID++;
        return id;
    }

    /**
     * Issues a command '#id=<name>' to identify this client on a remote
     * server.
     *
     * @param {string} name
     *      The name of this client. Should be unique.
     */
    identifyMe(name) {
        this.execute(`id`, `${name}`);
    }

    /**
     * Invokes a remote procedure.
     *
     * @param procName  {string}
     * @param args      {Array<*>}
     * @param cb        {function(err:Error?,result:*):void}
     * @param timeout   {number?}
     */
    invokeRPC(procName, args, cb, timeout = RPC_TIMEOUT) {
        let escaped_args = args.map((s) => `${s}`); // FIXME: Type cast.
        let rpc = {
            tag: this.__getUniqueRPCallID(),
            procName,
            ts: Date.now(),
            timeoutHandle: null,
            callback: cb,
            args: escaped_args
        };
        rpc.timeoutHandle = setTimeout(this.__handleRPCTimeout.bind(this), timeout, rpc.tag);
        this.#pendingRPCs[rpc.tag] = rpc;
        this.execute(`rpc`, rpc.tag, procName, escaped_args.join(" "));
    }

    /**
     * @param rpcName
     * @returns {RPC}
     */
    createRPCWrapper(rpcName) {
        return new RPC(this, rpcName);
    }

    __handleRPCall(raw) {
        // raw = raw.trim(); // Remove possible (at the beginning) / unnecessary (at the end) whitespaces.
        let { groups } = ((() => (RPC_REGEX.exec(raw) || { groups: {} }))()); // In-place.
        let rpc = {
            procName: groups.procName,
            args: (groups.argString || "").split(' '),
            resolve: ((result) => {
                this.execute(`result`, groups.tag, 200, result);
            })
        };
        if (!this.emit(`rpc:${rpc.procName}`, rpc)) { // Specific handler.
            if (!this.emit(`rpc`, rpc)) { // Global handler.
                this.execute(`result`, groups.tag, 501);
            }
        }
    }

    __handleRPCallResult(raw) {
        // raw = raw.trim(); // Remove possible (at the beginning) / unnecessary (at the end) whitespaces.
        let { groups } = ((() => (RPC_RESULT_REGEX.exec(raw) || { groups: {} }))()); // In-place.
        if (this.#pendingRPCs[groups.tag]) {
            clearTimeout(this.#pendingRPCs[groups.tag].timeoutHandle);
            let err = null;
            if (groups.callResult !== "200") {
                err = new Error(`RPC has failed: ${RPC_CODE_TO_TEXT_MAP[groups.callResult]}. Code ${groups.callResult}`);
            }
            this.#pendingRPCs[groups.tag].time = Date.now() - this.#pendingRPCs[groups.tag].ts;
            setImmediate(this.#pendingRPCs[groups.tag].callback, err, groups.result, this.#pendingRPCs[groups.tag]);
            delete this.#pendingRPCs[groups.tag];
        }
    }

    /**
     * @param tag {number}
     */
    __handleRPCTimeout(tag) {
        if (this.#pendingRPCs[tag]) {
            setImmediate(this.#pendingRPCs[tag].callback, new Error("Timeout"));
            delete this.#pendingRPCs[tag];
        }
    }

    /**
     * Checks if the connection is established and ready for data transfer.
     *
     * @returns {boolean}
     *      Returns true if the client is connected to the server.
     */
    isReady() { return this.getConnectionStatus() === CONNECTED; }

    isConnected() { return this.isReady(); }

    /**
     * Retrieves topics from Mediator that are matching the specified wildcard. Actually, it sends a "#list" command with the parameter specified by user.
     *
     * @param mask  {string}
     *      A wildcard mask that should be applied to the result.
     *
     * @param cb    {function(error:Error?, mask:string):void}
     *      A callback function to invoke when
     */
    list(
        mask = "*",
        cb = null
    ) {
        // FIXME: Namespace is ignored.
        return this.execute("list", mask, cb ? ((error) => {
            try {
                cb(error, mask);
            } catch (e) {
                console.error(e);
            }
        }) : null); // Prevent undefined.
    }

    /**
     * @private
     */
    __listOnConnect() {
        if (!this.#listOnConnect) {
            return;
        }
        let mask;
        try {
            mask = normalizeTopicName(this.#listOnConnect, this.#nsDelimiter);
        } catch (e) {
            mask = "*";
        }
        this.list(mask);
    }

    __log(...args) {
        this.#print(...args);
    }

    /**
     * Allows to add close handler callback. Alias for MediatorClient#on
     * with "close" argument.
     *
     * @param {function(Error)} fn - A callback function.
     * @returns {MediatorClient}
     *      Returns this object for ability to chain method calls.
     */
    onClose(fn) {
        this.on("close", fn);
        return this;
    }

    /**
     * @param fn    {function(MediatorClient):void}
     * @param once  {boolean}
     * @returns     {MediatorClient}
     */
    onConnected(fn, once = false) {
        this[once === true ? "once" : "on"]("ready", fn);
        return this;
    }

    /**
     * Allows to add error handler callback. Alias for MediatorClient#on
     * with "error" argument.
     *
     * @param {function(Error)} fn - A callback function.
     * @returns {MediatorClient}
     *      Returns this object for ability to chain method calls.
     */
    onError(fn) {
        this.on('error', fn);
        return this;
    }

    /**
     * Alias for MediatorClient#on with "ready" argument. This event is emitted
     * when a client had established the connection to the remote socket or
     * opened a pipe.
     *
     * @param {function(client:MediatorClient):void} fn
     *      Callback function. When the event emitted, the 1st argument points
     *      to this MediatorClient instance.
     * @param {boolean} once
     *      Specifies if the handler should be called only once, if the event
     *      is fired more than one time (see EventEmitter#once).
     * @returns {MediatorClient}
     *      This instance.
     */
    onReady(fn, once = false) {
        this[once === true ? "once" : "on"]("ready", fn);
        return this;
    }

    /**
     * An alias for MediatorClient.on('update').
     *
     * @param fn    {function(TopicNotification):void}
     *      Callback.
     * @returns     {MediatorClient}
     *      Returns this object.
     */
    onUpdate(fn) {
        this.on('update', fn);
        return this;
    }

    registerRPC(name) {
        this.execute(`regrpc`, name);
    }

    /**
     * Optimizes list of subscriptions by removing duplicate entries
     * or replacing all with "*" when it is presented.
     *
     * @private
     */
    __optimizeSubscriptions() {
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
     * Retrieves last published value from the server to the specified topic.
     *
     * If the topic is non-persistent (aka event topic), the server usually
     * returns an empty value. The call also leads to an update of a related
     * Topic object (if it exists and is not locked).
     *
     * @param topicName          {string}
     *      The name of the topic.
     *
     * @param defaultValue  {*|null}
     *      Value to store to the topic if it does not exist.
     *
     * @param cb            {function(err:Error?,value:string?,notif:TopicNotification?):void}
     *      The callback function to invoke on data retrieval, or on any error
     *      occasion.
     *
     * @param timeout       {number}
     *      Specifies a timeout if no value is retrieved from the server before
     *      the callback is invoked with MediatorClientTimeoutError. Only
     *      matters if the callback is specified. Default: 2500 ms (defined as
     *      CLIENT_DEFAULT_RETRIEVE_TIMEOUT).
     *
     * @throws Error
     *      When a client is not connected.
     *      See {@link MediatorClient#getConnectionStatus}.
     *
     * @returns             {MediatorClient}
     */
    retrieve(
        topicName,
        defaultValue = null,
        cb = null,
        timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT
    ) {
        if (this.#paramChecks) {
            if (!(topicName) || typeof topicName !== "string") {
                throw new Error(`Name must be a non-empty string (specified: [${typeof topicName}] "${topicName}")`);
            }
            if (cb && typeof cb !== "function") {
                throw new Error(`Callback must be a function (specified: ${typeof cb})`);
            }
        }
        this.__checkConnected();
        let absoluteName = resolveNamespace(topicName, this.#namespace);
        let query = ensureEndsWith(absoluteName, QUESTMARK);
        defaultValue = (defaultValue === null ? "" : defaultValue);
        this.__enqueueSend({
            id: query,
            value: defaultValue
        });
        this.__awaitNotificationUnsafe(absoluteName, timeout, ((error, notif) => cb(error, notif ? notif.value : undefined, notif)));
        return this;
    }

    /**
     * Retrieves latest value of a channel from the server. This method is
     * similar to {@link MediatorClient#retrieve}, but returns {@link Promise}.
     *
     * @param name              {string}
     *      The name of a channel to retrieve latest value from.
     *
     * @param [defaultValue]    {*}
     *      Specifies value to store/publish if no such channel exists
     *      on the Mediator server.
     *
     * @param [timeout]         {number}
     *      Sets timeout duration of data retrieval, before the {@link Promise}
     *      would be rejected with {@link ClientTimeoutError}.
     *
     * @returns                 {Promise<string>}
     */
    retrieveAsync(
        name,
        defaultValue = null,
        timeout = CLIENT_DEFAULT_RETRIEVE_TIMEOUT
    ) {
        return new Promise((resolve, reject) => {
            try {
                this.retrieve(name, defaultValue, ((error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value);
                    }
                }), timeout);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     *
     * @param varIDs {null|string}
     *      ...
     *
     * @returns {MediatorClient}
     *      Returns this object.
     */
    resetTimestamp(...varIDs) {
        if (varIDs[0] === null) {
            this.#timeslots = {};
        } else {
            varIDs.forEach((s) => {
                delete this.#timeslots[s];
            });
        }
        return this;
    }



    /**
     * Stores {@link Variable} in Mediator.
     *
     * @param args {...*}
     *      One of two possible variants. The last argument can be a callback
     *      function to call when a variable is written to socket.
     *
     * @callback {function(Error):void}
     */
    store(...args) { // TODO: Requires refactoring.
        let cb = popCallback(args);
        let ravList = normalizeRavToList(args);
        let xx;
        let now = Date.now();
        for ( let slot of ravList ) {
            let s = normalizeTopicName(slot.id, this.#nsDelimiter);
            xx = {
                id: resolveNamespace(s, this.#namespace),
                value: this.#stringify(slot.value),
                cb
            };
            if (this.#tsMode !== "none" && !(this.#rawMode)) {
                if (typeof slot.ts === "number") {
                    xx.ts = slot.ts;
                } else {
                    if (this.#tsMode === "abs") {
                        xx.ts = now;
                    } else if (this.#tsMode === "rel") {
                        if (this.#timeslots[xx.id]) { // Defined?
                            xx.ts = now - this.#timeslots[xx.id];
                        } else {
                            xx.ts = 0;
                        }
                        this.#timeslots[xx.id] = now;
                    }
                }
            }
            this.__w(xx, false);
        }
        return this;
    }

    /**
     * @param args {function|string|Array<string>|{ channel: string, cb: function(value: *):void }}
     *
     * @returns {MediatorClient}
     *      Returns this object for ability to chain method calls.
     */
    subscribe(...args) {
        if (typeof args[0] === "object") {
            for (let h of args) {
                if (typeof h !== "object") {
                    MediatorClient.th(`Not an object`);
                }
                if (typeof h.channel !== "string") {
                    MediatorClient.th(`Channel must be a string`);
                } else if (!!h.cb && typeof h.cb !== "function") {
                    MediatorClient.th(`Subscription handler (fn) must be a function (or must be undefined)`);
                }
                h.channel = h.channel.trim();
                if (h.channel === "") {
                    MediatorClient.th(`Channel must be a non-empty string`);
                }
                this.subscribe(h.channel, h.cb);
            }
        } else {
            let cb = popCallback(args);
            let updated = 0;
            ff(args, this.#namespace).forEach((s) => {
                if (cb !== null) {
                    this.on(`update:${s}`, cb);
                }
                this.#subscriptions.push(s);
                this.__log(`Subscribed: ${s} (custom handler: ${cb !== null ? "YES" : "NO"})`);
                updated++;
            });
            // Allow subsequent calls to accumulate all changes to the subscription
            // list on this event loop tick.
            if (updated > 0 && !this.#pendingImmediate) {
                this.#pendingImmediate =
                    setImmediate(this.__updateNotifications.bind(this));
            }
        }
        return this;
    }

    /**
     * Removes all subscription handlers for variables.
     *
     * @param varIDs {...string}
     *
     * @returns {MediatorClient}
     *      Returns this object.
     */
    unsubscribe(...varIDs) {
        let updated = 0;
        ff(varIDs).forEach((s) => {
            if (this.#printingMessages) {
                this.#print(`Unsubscribed: ${s}`);
            }
            this.removeAllListeners(`update:${s}`); // FIXME: This does not work!!!!!
            updated++;
        });
        // Allow subsequent calls to accumulate all changes to the subscription
        // list on this event loop tick.
        if (updated > 0 && !this.#pendingImmediate) {
            this.#pendingImmediate =
                setImmediate(this.__updateNotifications.bind(this));
        }
        return this;
    }

    /**
     * Executes "notify" command.
     * @returns {MediatorClient} Returns this object.
     */
    __updateNotifications() {
        this.__optimizeSubscriptions();
        let joinedString = this.#subscriptions.join(" ");
        this.execute(`notify`, `${this.#userNotificationMask} ${joinedString}`.trim());
        return this;
    }

    /**
     * @private
     *
     * Writes {@link Variable} to the socket if the client is connected.
     * Otherwise, this packet is enqueued (according to the client settings).
     *
     * @param {Variable} rav
     * @param {boolean} forcePush=false
     *
     * @returns {MediatorClient}
     *      Returns this object for ability to chain method calls.
     */
    __w(rav, forcePush = false) {
        if (this.isReady()) {
            if (this.#queue.length > 0) {
                this.__flushQueue();
            }
            let pack = rav2s(rav);
            this.#socket.write(`${pack}${this.#eol}`, this.#encoding, rav.cb);
        } else {
            if (this.#queueType !== "none") {
                if (forcePush || (this.#queue.length < this.#offlineQueueSize)) {
                    this.#queue.push(cloneVariable(rav));
                } else {
                    switch (this.#queueType) {
                        default:
                        case "fixed":
                            break;
                        case "evicting":
                            this.#queue.shift();
                            this.#queue.push(cloneVariable(rav));
                            break;
                    }
                }
            }
        }
        return this;
    }

    // Static:

    static th(message, cause = null) {
        throw ClientError.create(message).set('cause', cause);
    }

    /**
     * Factory method.
     *
     * @param opts {MediatorClientSettings}
     * @returns {MediatorClient}
     */
    static create(opts) {
        return new MediatorClient(opts);
    }

    // Properties:

    /**
     * @returns {boolean}
     */
    get connected() {
        return this.isReady();
    }

    /**
     * @returns     {string}
     */
    get host() {
        return this.#host;
    }

    /**
     * @returns     {number}
     */
    get port() {
        return this.#port;
    }

    /**
     * @returns {MediatorClientSettings}
     *      A copy of settings.
     */
    get settings() {
        return Object.assign({}, this.#opts);
    }

    /**
     * Returns the list of subscriptions this client subscribed to.
     *
     * @returns {string[]}
     */
    get subscriptions() {
        return [...this.#subscriptions];
    }

    /**
     * @param value {string}
     */
    set host(value) {
        if (this.getConnectionStatus() !== DISCONNECTED) {
            throw new ClientIllegalStateError("This action allowed only when client is disconnected");
        }
        this.#host = `${value}`;
        this.#opts.host = this.#host;
    }

    /**
     * @param value {number}
     */
    set port(value) {
        if (this.getConnectionStatus() !== DISCONNECTED) {
            throw new ClientIllegalStateError("This action allowed only when client is disconnected");
        }
        this.#port = Number(value);
        this.#opts.port = this.#port;
    }
}

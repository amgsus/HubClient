/*
 * By:              A.G.
 * Created:         2020.01.21
 * Last modified:   2020.01.29
 */

import EventEmitter           from "events";
import { ABSMARK, EVENTMARK } from "./common.mjs";

/**
 * @emits publish
 * @emits store
 * @emits update
 * @emits error
 */
export class Topic extends EventEmitter {
    /**
     * @param client            {MediatorClient}
     * @param name              {string}
     * @param [options]
     * @param [options.locked]  {boolean}
     *      Suppresses an 'update' event on this object and prevents the cached
     *      value modification by an external update notification (i.e., making
     *      this Topic writable only by the user code). Calling retrieve() does
     *      its job, but will not affect this Topic's value.
     * @param [options.serialize]       {function}
     *      A user-defined routine used to convert Topic value (locally
     *      assigned) to a plain string before sending it to the server.
     * @param [options.deserialize]     {function}
     *      A user-defined routine used to convert a plain string to a
     *      user-defined type (for example, JSON.parse()).
     * @param [options.initialValue]    {*}
     *      Initial value.
     * @param [options.type]            {string}
     */
    constructor(client, name, options = {}) { super();
        this.shadowValue = options.initialValue;
        this.client      = client;
        this.name        = name;
        this.id          = this.name;
        this.ts          = null;
        this.lastUpdated = 0;
        this.locked      = options.locked === true;
        this.serialize   = options.serialize;
        this.deserialize = options.deserialize;
        this.type        = options.type || "";
    }

    /**
     * @param action        {string}
     * @param value         {*}
     * @param ts            {number|null}
     * @param callback      {function(Error?):void}
     */
    __internalSend(
        action,
        value,
        ts = null,
        callback = null // TODO: Callback is not implemented.
    ) {
        let mark;
        if (action === "store") {
            mark = ABSMARK;
        } else if (action === "publish") {
            mark = `${ABSMARK}${EVENTMARK}`;
        } else {
            throw new Error(`Unknown action`);
        }
        if (typeof value == "undefined") {
            throw new TypeError(`Value is not specified`);
        }
        if (callback && typeof callback != "function") {
            throw new TypeError(`Specified callback parameter is not a function`);
        }
        this.shadowValue = value;
        this.ts = typeof ts == "number" ? ts : Date.now();
        let serialized;
        if (this.serialize) {
            try {
                serialized = this.serialize(this.shadowValue);
            } catch (e) {
                this.emit("error", TopicSerializationError.create(e, this.shadowValue));
                return;
            }
        } else {
            serialized = this.shadowValue;
        }
        this.client.store(`${mark}${this.name}`, serialized, this.ts);
        this.emit(action, this.value, this);
    }

    /**
     * The same as {@link Topic.storeChrono} but with nulled timestamp.
     *
     * @param value         {*}
     * @param callback      {function(Error?):void}
     * @returns             {Topic}
     */
    store(
        value,
        callback = null
    ) {
        return this.storeChrono(value, null, callback);
    }

    /**
     * @param value         {*}
     * @param ts            {number|null}
     * @param callback      {function(Error?):void}
     * @returns             {Topic}
     */
    storeChrono(
        value,
        ts = null,
        callback = null
    ) {
        this.__internalSend("store", value, ts, callback);
        return this;
    }

    /**
     * @param defaultValue  {*}
     * @param callback      {function(error:Error?,value:string?,notification:TopicNotification?):void}
     * @returns             {Topic}
     */
    retrieve(
        defaultValue = null,
        callback
    ) {
        this.client.retrieve(`${ABSMARK}${this.id}`, defaultValue, callback);
        return this;
    }

    /**
     * @param defaultValue  {*}
     * @returns             {Promise<*>}
     */
    retrievePromisified(defaultValue = null) {
        return new Promise((res, rej) => {
            this.retrieve(defaultValue, ((error, value) => {
                if (error) {
                    return rej(error);
                }
                res(value);
            }));
        });
    }

    /**
     * The same as {@link Topic.publishChrono} but with nulled timestamp.
     *
     * @param value         {*}
     * @param callback      {function(Error?):void}
     * @returns             {Topic}
     */
    publish(
        value,
        callback = null
    ) {
        return this.publishChrono(value, null, callback);
    }

    /**
     * @param value         {*}
     * @param ts            {number|null}
     * @param callback      {function(Error?):void}
     * @returns             {Topic}
     */
    publishChrono(
        value,
        ts = null,
        callback = null
    ) {
        this.__internalSend("publish", value, ts, callback);
        return this;
    }

    /**
     * @param callback      {function(value:*,ts:number,topic:Topic):void}
     * @returns             {Topic}
     */
    subscribe(callback) {
        this.on("update", callback);
        return this;
    }

    /**
     * @param callback      {function(value:*,ts:number,topic:Topic):void}
     * @returns             {Topic}
     */
    unsubscribe(callback) {
        this.removeListener("update", callback);
        return this;
    }

    /**
     * @returns             {Topic}
     */
    unsubscribeAll() {
        this.removeAllListeners("update");
        return this;
    }

    /**
     * Updates the shadow value, timestamp and last updated timestamp. Should
     * be called by the owner object when new data is available.
     *
     * @param value         {*}
     *      Shadow value.
     * @param ts            {*}
     *      Timestamp.
     * @private
     */
    updateData(value, ts) {
        let freezed = false;
        if (this.locked) {
            return;
        }
        if (this.deserialize) {
            try {
                this.shadowValue = this.deserialize(value);
            } catch (e) {
                this.emit("error", TopicSerializationError.createDeserialize(e, value));
                return;
            }
            freezed = (typeof this.shadowValue).includes("object");
        } else {
            this.shadowValue = value;
        }
        this.ts           = Number(ts);
        this.lastUpdated  = Date.now();
        this.emit("update", freezed ? Object.freeze(this.shadowValue) : this.shadowValue, this.ts, this); // FIXME: Object.freeze()
    }

    /**
     * @returns             {*}
     */
    get value() {
        return this.shadowValue;
    }

    /**
     * @param newValue      {*}
     */
    set value(newValue) {
        this.store(newValue);
    }
}

export class TopicSerializationError extends Error {
    constructor(cause, data, action = "serialize") { super();
        this.action = action;
        this.cause  = cause;
        this.data   = data;
    }

    static create(cause, rawData) {
        return new TopicSerializationError(cause, rawData);
    }

    static createDeserialize(cause, rawData) {
        return new TopicSerializationError(cause, rawData, "deserialize");
    }
}

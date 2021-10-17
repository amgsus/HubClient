/*
 * Author: A.G.
 *   Date: 2021/10/06
 */

import {
    QUEUE_EVICTING,
    QUEUE_FIXED,
    QUEUE_HASHED
} from "./../client.mjs";

import {
    HubClientError,
    ERR_QUEUE_FULL,
    ERR_QUEUE_UPDATE
} from "./../common/error.mjs";

export class HubStorageQueue {
    #type;
    #queue;
    #maxSize;
    #order = [];

    constructor(opts) {
        let temp = {
            type: this.#type,
            maxSize: this.#maxSize
        } = opts;

        this.clear(); // Initialize queue.
    }

    clear() {
        switch (this.#type) {
            case QUEUE_FIXED:
            case QUEUE_EVICTING:
                this.#queue = []; // [ Object ]
                break;
            case QUEUE_HASHED:
                this.#queue = {}; // { Key: Object }
                break;
        }
    }

    add(item) {
        switch (this.#type) {
            case QUEUE_FIXED:
                if (this.#queue.length < this.#maxSize) {
                    this.#queue.push(item);
                } else {
                    if (item.callback) {
                        setImmediate(() => {
                            if (item.callback) {
                                item.callback(HubClientError.createCode(ERR_QUEUE_FULL));
                            }
                        });
                    }
                }
                break;
            case QUEUE_EVICTING:
                if (this.#queue.length >= this.#maxSize) {
                    let old = this.#queue.shift();
                    if (old.callback) {
                        setImmediate(() => {
                            if (item.callback) {
                                item.callback(HubClientError.createCode(ERR_QUEUE_FULL));
                            }
                        });
                    }
                }
                this.#queue.push(item);
                break;
            case QUEUE_HASHED:
                if (this.#queue[item.key]) {
                    if (this.#queue[item.key].callback) { // Do some sort of error callback.
                        let old = this.#queue[item.key];
                        setImmediate(() => {
                            if (this.#queue[item.key].callback) {
                                let error = HubClientError.createCode(ERR_QUEUE_UPDATE)
                                    .set("value", old)
                                    .set("newValue", item);
                                this.#queue[item.key].callback(error);
                            }
                        });
                    }
                }
                this.#queue[item.key] = item;
                break;
        }
    }

    forEach(delegate) {
        if (typeof this.#queue === "object") {
            this.#iterate(Object.values(this.#queue), delegate);
        } else if (Array.isArray(this.#queue)) {
            this.#iterate(this.#queue, delegate);
        }
        this.clear();
    }

    #iterate(items, delegate) {
        items.forEach((item, index) => delegate(item, index));
    }
}

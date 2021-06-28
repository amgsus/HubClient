/*
 * By:              A.G.
 * Created:         2020.01.21
 * Last modified:   2020.01.23
 */

import { NSDELIM } from "./common.mjs";

export class TopicNotification {
    constructor(id = "", value = "", ts = null, namespace = "") {
        this.id = id;
        this.name = this.id;
        this.value = value;
        this.ts = ts;
        this.namespace = namespace;
    }

    get absoluteName() {
        return this.namespace
            ? `${this.namespace}${NSDELIM}${this.id}`
            : `${this.id}`;
    }

    toString() {
        let ts = "";
        if (typeof this.ts === "number") {
            ts = `@${this.ts}`;
        }
        return `${this.absoluteName}${ts}=${this.value}`;
    }
}

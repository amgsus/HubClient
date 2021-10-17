/*
 * Author: A.G.
 *   Date: 2020/01/21
 */

export class TopicNotification {
    constructor(id = "", value = "", ts = null, namespace = "", namespaceDelimiter = "") {
        this.id = id;
        this.namespaceDelimiter = namespaceDelimiter;
        this.name = this.id;
        this.value = value;
        this.ts = ts;
        this.namespace = namespace;
    }

    get absoluteName() {
        return this.namespace
            ? `${this.namespace}${this.namespaceDelimiter}${this.id}`
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

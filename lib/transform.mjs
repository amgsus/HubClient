/*
 * Author: A.G.
 *   Date: 2019/09/29
 */

import Stream                        from "stream";
import { deleteUndefinedFromObject } from "./utils/utils.mjs";

const REGEX = new RegExp(/(?:\s*)(?<key>(?<mod>[#$%!~])?(?<id>[^@]*?))(?:(?<q>\?)?=?|@(?<ts>[-+]?\d+)=)(?:(?<==)(?<value>.*))?(?:\r?\n)/, "g");

const EMPTY_DATA = Object.freeze({ key: "", mod: null, id:"", q: false, ts: null, value: "" });

export class HubClientStreamParser extends Stream.Transform {
    constructor() { super({ objectMode: true });
        this.data = "";
    }

    _transform(chunk, encoding, cb) {
        this.data += (chunk instanceof Buffer ? chunk.toString() : chunk);
        let matches = this.data.matchAll(REGEX);
        let lastIndex = 0;
        for ( let m of matches ) {
            if (!m[0].trim()) { // FIXME: RegExp fails to handle CRLF properly and pushes out an empty string?..
                continue;
            }
            let packet = Object.assign({}, EMPTY_DATA, deleteUndefinedFromObject(m.groups));
            this.push(packet);
            lastIndex = m.index + m.input.length;
        }
        this.data = this.data.slice(lastIndex);
        cb();
    }

    _flush(cb) {
        this.data = "";
        cb();
    }
}

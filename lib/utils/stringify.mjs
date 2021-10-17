/*
 * Author: A.G.
 *   Date: 2019/10/02
 */

export const STRINGIFY_DEFAULTS = Object.freeze({
    snull: "null",
    sundefined: "undefined",
    strue: "true",
    sfalse: "false",
    snan: "NaN",
    sinfinite: "INF",
    sothers: "",
    shexadecimal: false,
    jsonify: true,
    hexaPrefix: "0x"
});

export function stringify(options, any) {
    let s;
    let type = typeof any;
    if (any === null) {
        s = options.snull;
    } else if (type === "string") {
        s = any;
    } else if (type === "number") {
        if (isFinite(any)) {
            if (options.shexadecimal) {
                s = `${options.hexaPrefix}${Number(any).toString(16)}`;
            } else {
                s = Number(any).toString(10);
            }
        } else {
            if (isNaN(any)) {
                s = options.snan;
            } else {
                s = options.sinfinite;
            }
        }
    } else if (type === "boolean") {
        if (any === true) {
            s = options.strue;
        } else {
            s = options.sfalse;
        }
    } else if (type.includes("object") && options.jsonify) {
        s = JSON.stringify(any);
    } else {
        s = options.sothers;
    }
    return s;
}

/*
 * By:       A.G.
 * Modified: 2019.10.02
 */

"use strict"

/**
 *  @typedef StringifyOptions
 * @type {Object}
 *
 * @property {string} snull
 * @property {string} sundefined
 * @property {string} strue
 * @property {string} sfalse
 * @property {string} snan
 * @property {string} sinfinite
 * @property {string} sothers
 * @property {string} hexaPrefix
 * @property {boolean} shexadecimal
 * @property {boolean} jsonify
 */

/**
 * @type {StringifyOptions}
 *
 * Default settings for stringify() function.
 */
export const STRINGIFY_DEFAULTS = {
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
};

/**
 * Converts any into a string according to the next rules:
 * - Null or an argument of undefined type are both converted into an empty string;
 * - String is converted into a string;
 * - Number is converted into a string if possible;
 * - Boolean is converted into 'true' or 'false'.
 *
 * @param {*} any
 * @param {StringifyOptions} options
 */
export function
stringify(any, options = STRINGIFY_DEFAULTS) {
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

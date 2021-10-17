/*
 * Author: A.G.
 *   Date: 2019/09/28
 */

import {
    ABSNMARK,
    EVENTMARK,
    FNMARK
} from "../common/const.mjs";

export function popCallbackOnly(fnArgs) { // TODO: Delete.
    if (fnArgs.length > 0) {
        if (typeof fnArgs[fnArgs.length - 1] === "function") {
            return fnArgs.pop();
        }
    }
    return null;
}

export function popCallback(args) { // TODO: Delete.
    let callback = null;
    if (args.length > 0) {
        if (typeof args[args.length - 1] === "function") {
            callback = args[args.length - 1];
        }
    }
    return {
        args: callback ? args.slice(0, -1) : args,
        callback
    };
}

export function last(arr, offset = 1) {
    return arr.length > 0 ? arr[arr.length - offset] : undefined;
}

/**
 * Splits function's argument list and extracts callback optionally followed
 * by timeout.
 *
 * @param args
 * @param {number} guardedCount -
 *      number of elements from beginning of list to be skipped in slicing.
 * @param {boolean} slicingFromBeginning -
 *      determines if slicing starts from beginning right after guarded elements
 *      specified by doNotSliceBeginCount parameter. All remaining arguments are
 *      returned as vargs array.
 * @param {boolean} allowNullCallback -
 *      this can be enabled only when scanning from end of argument list.
 */
export function sliceCallbackWithTimeout(args, guardedCount = 0, slicingFromBeginning = false, allowNullCallback = false) { // TODO: allowNullCallback
    let ret = { };
    let sliceCount = 0;

    if (!Array.isArray(args)) { // IArguments -> []
        args = Array.from(args);
    }

    if (guardedCount > 0) { // Cut guarded items at beginning.
        ret.args = args.splice(0, guardedCount); // Pass to returned object.
    } else {
        ret.args = [];
    }

    if (slicingFromBeginning) {
        let i;
        for ( i = 0; i < args.length; i++ ) { // Scan for argument of type function.
            if (typeof args[i] === "function") {
                ret.callback = args[i];
                if (typeof args[i + 1] === "number") {
                    ret.timeout = Math.trunc(args[i + 1]);
                    sliceCount = 2;
                } else {
                    sliceCount = 1;
                }
                break;
            }
        }
        ret.args.push(...args.splice(0, i));
        ret.vargs = args.slice(sliceCount);
    } else {
        sliceCount = -args.length; // By default, slice all presented args.
        if (args.length >= 2) {
            if (typeof args[args.length - 1] === "function") {
                ret.callback = args[args.length - 1];
                sliceCount = 1;
            } else if (typeof args[args.length - 1] === "number" && typeof args[args.length - 2] === "function") {
                ret.callback = args[args.length - 2];
                ret.timeout = Math.trunc(args[args.length - 1]);
                sliceCount = 2;
            }
        } else if (args.length >= 1) {
            if (typeof args[args.length - 1] === "function") {
                ret.callback = args[args.length - 1];
                sliceCount = 1;
            }
        }
        ret.args.push(...args.slice(0, -sliceCount));
        ret.vargs = [];
    }

    return ret;
}

// store("Temperature", 1000);
// store([ { name: "Temperature", value: 1000 }, { name: "SwitchON", value: true, ts: 200 } ]);
// store({ Temperature: 1000, "SwitchON@200": true });

export function normalizeArgsToValueList(args) {
    let itemsOut = [];
    if (typeof args[0] === "string") {
        itemsOut.push({
            key: args[0],
            value: args[1],
            ts : Number(args[2])
        });
    } else if (Array.isArray(args[0])) {
        for ( let item of args[0] ) {
            itemsOut.push({
                key: item.key || item.name,
                value: item.value,
                ts : Number(item.ts)
            });
        }
    } else if (typeof args[0] === "object" || (typeof args[0]).indexOf("Object") >= 0) {
        let obj = args[0];
        let keyNames = Object.keys(obj);
        for ( let k of keyNames ) {
            if (typeof k === "string") {
                let { key, ts } = parseCombinedKeyName(k);
                if (key.trim().length > 0) {
                    itemsOut.push({
                        key,
                        value: obj[k],
                        ts: Number(ts)
                    });
                }
            }
        }
    }
    return itemsOut;
}

export function parseCombinedKeyName(input) {
    let [ key, ts ] = input.split("@", 2);
    return { key, ts };
}

export function rav2s(item) {
    let ts = "";
    if (typeof item.ts === "number" && !isNaN(item.ts)) {
        ts = `@${item.ts}`;
    }
    if (item.value !== null && typeof item.value !== "undefined") {
        return `${item.key}${ts}=${item.value}`;
    } else {
        return `${item.key}${ts}`;
    }
}

export function resolveName(name, namespace, delimiter) {
    if (name[0] === ABSNMARK) {  // Do not add namespace if name is marked as unresolvable.
        return name.slice(1);
    } else if (!namespace) {     // Namespace is not set.
        return name;
    }
    if (name[0] === EVENTMARK) { // Add namespace after modifier sign.
        name = name.slice(1);
        return `${EVENTMARK}${namespace}${delimiter}${name}`;
    } else {
        return `${namespace}${delimiter}${name}`;
    }
}

export function ff(varIDs, namespace, namespaceDelimiter) {
    return varIDs
        .filter((s) => // Remove command variables if any.
            !(String(s).startsWith(FNMARK)))
        .map((s) => // Apply namespaces to the names.
            resolveName(s, namespace, namespaceDelimiter));
}

/**
 * @param s         {string}
 * @param postfix   {string}
 */
export function ensureEndsWith(s, postfix) {
    if (postfix === s.slice(-postfix.length)) {
        return s;
    }
    return `${s}${postfix}`;
}

/**
 * Deletes properties from an object that have undefined values.
 *
 * @param obj   {object}
 * @returns     {object}
 */
export function deleteUndefinedFromObject(obj) {
    let cleanOne = Object.entries(obj)
        .filter((e) => (typeof e[1] !== "undefined"));
    return Object.fromEntries(cleanOne);
}

export function createPromiseBasedOn(func) {
    return new Promise((resolve, reject) => {
        try {
            func((err, ...args) => {
                if (err) return reject(err);
                resolve(...args);
            })
        } catch (e) {
            reject(e);
        }
    });
}

export function arrayDeleteItem(arr, item) {
    let index = arr.indexOf(item);
    if (index >= 0) {
        arr.splice(index, 1);
    }
    return index >= 0;
}

export function definedOrDefault(value, defaultValue, allowNull = true) {
    if (allowNull) {
        return typeof value === "undefined" ? defaultValue : value;
    } else {
        return typeof value === "undefined" || value === null ? defaultValue : value;
    }
}

export function nameof(obj) { return Object.keys(obj)[0]; }

export function transformToStringArgsWithEscaping(args) {
    return args.map((src) => String(src).replace(/[\\$'"]/g, "\\$&"));
}

export function escapeString(s) {
    return s; // TODO
}

export function execRegExpGroups(regexp, s, _default_ = null, cb = null) {
    if (typeof s !== "string") {
        throw new TypeError("Input is not a string");
    }
    let match = regexp.exec(s);
    let result = match ? match.groups : _default_;
    if ((typeof cb === "function") && (match !== null)) {
        try {
            let userResult = cb(result);
            if (typeof userResult !== "undefined") {
                return userResult;
            }
        } catch (e) {
            console.error(e);
        }
    }
    return result;
}

export function invokeCallbackOrReturnPromise(delegate, callback) {
    if (typeof callback === "function") {
        try {
            delegate(callback);
        } catch (e) {
            callback(e);
        }
    } else {
        return createPromiseBasedOn(delegate);
    }
}

export function isTranslatableToString(any) {
    let t = typeof any;
    return t === "number" || t === "string" || t === "boolean";
}

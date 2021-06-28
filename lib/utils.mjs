/*
 * By:              A.G.
 * Created:         2019.09.28
 * Last modified:   2020.01.27
 */

import {
    ABSMARK, EVENTMARK,
    FNMARK,
    NSDELIM
} from "./common.mjs";

/**
 * @param fnArgs { Array<*> }
 * @returns {function|null}
 */
export function
popCallback(fnArgs) {
    if (fnArgs.length > 0) {
        if (typeof fnArgs[fnArgs.length - 1] === "function") {
            return fnArgs.pop();
        }
    }
    return null;
}

export function
normalizeRavToList(args) {
    let items = [];
    if (typeof args[0] === "string") {
        // args[0] is path.
        // args[1] is value (optional).
        // args[2] is ts (optional).
        items.push({
            id    : args[0],
            value : args[1],
            ts    : args[2]
        });
    } else if (Array.isArray(args[0])) {
        for ( let item of args[0] ) {
            items.push({
                id: item.id,
                value : item.value,
                ts: item.ts
            });
        }
    } else if (typeof args[0] === "object") {
        // args[0] is object => treat others also as objects.
        args.forEach((item) => {
            items.push({
                id: item.id,
                value : item.value,
                ts: item.ts
            });
        });
    }
    return items;
}

export function
rav2s(item) {
    let ts = "";
    if (typeof item.ts === "number") {
        ts = `@${item.ts}`;
    }
    return `${item.id}${ts}=${item.value}`;
}

/**
 * @param rav {Variable}
 * @return {Variable}
 */
export function
cloneVariable(rav) {
    return {
        id: rav.id,
        value: rav.value,
        ts: rav.ts,
        cb: rav.cb
    };
}

/**
 * @param topicName {string}
 * @param namespace {string|null}
 * @param delim     {string}
 * @param abs       {string}
 * @returns         {string}
 */
export function
resolveNamespace(topicName, namespace, delim = NSDELIM, abs = ABSMARK) {
    if (topicName[0] === abs) {
        // Do not add namespace if the topic name is marked absolute ("!").
        return topicName.slice(abs.length);
    } else {
        if (!namespace) {
            return topicName;
        }
    }
    if (isModifier(topicName[0])) {
        // Insert the namespace after a modifier sign.
        return `${topicName[0]}${namespace}${delim}${topicName.slice(1)}`;
    }
    return `${namespace}${delim}${topicName}`;
}

export function isModifier(c) {
    return (c === EVENTMARK || c === FNMARK);
}

export function
ff(varIDs, namespace = "")
{
    return varIDs
        .filter((s) => // Remove command variables if any.
            !(String(s).startsWith(FNMARK)))
        .map((s) => // Apply namespaces to the names.
            resolveNamespace(s, namespace));
}

export function
defaultPrint(s, ...args) {
    const ERR_PREFIX = "ERROR:";
    if (s.indexOf(ERR_PREFIX) === 0) {
        s = s.slice(ERR_PREFIX.length).trimLeft();
        return console.error(s, ...args);
    }
    console.log(s, ...args);
}

// /**
//  * Invokes a function "cb" (call is wrapped in try..catch block) if presented.
//  * If the callback is not a function or undefined, the call does nothing.
//  *
//  * @param cb {*}
//  * @param args {*}
//  * @returns {*}
//  */
// export function invokeCallback(cb, ...args) {
//     if (Array.isArray(cb)) {
//         let fn = popCallback([...cb]);
//         return cb(...args);
//     } else {
//         if (typeof cb === "function") {
//             try {
//                 return cb(...args);
//             } catch (e) {
//                 console.error(e); // Only for debug.
//             }
//         }
//     }
// }

/**
 * @param s         {string}
 * @param postfix   {string}
 */
export function
ensureEndsWith(s, postfix) {
    if (postfix === s.slice(-postfix.length)) {
        return s;
    }
    return `${s}${postfix}`
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

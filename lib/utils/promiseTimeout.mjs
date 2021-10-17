/*
 * By:              A.G.
 * Created:         2020.02.08
 * Last modified:   2020.02.08
 */

export class PromiseTimeoutError extends Error {
    constructor(causeOrMessage) { super();
        this.cause = null;
        this.message = "Timeout";
        if (typeof causeOrMessage === "object") {
            this.cause = causeOrMessage;
        } else if (typeof causeOrMessage === "string") {
            this.message = causeOrMessage;
        }
    }
}

/**
 * Creates a promise that always resolves/rejects within the specified time
 * interval either with a computed value or with TimeoutError (or any other
 * caught error).
 *
 * @param promise   {Promise<*>}
 * @param ms        {number}
 * @param cause     {string|object}
 * @returns         {Promise<*>}
 */
export function
wrapPromiseInTimeout(promise, ms, cause = null)
{
    let tm;
    let tp = new Promise((resolve, reject) => {
        tm = setTimeout((() => {
            reject(new PromiseTimeoutError(cause));
        }), ms);
    });
    return Promise.race([promise, tp]).then((v) => {
        clearTimeout(tm);
        return v;
    }).catch((err) => {
        clearTimeout(tm);
        throw err;
    });
}

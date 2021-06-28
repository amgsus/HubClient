/*
 * By:              A.G.
 * Created:         2019.10.03
 * Last modified:   2020.02.09
 */

export class ClientError extends Error {
    constructor(message) {
        super();
        this.message = message || "";
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Handy method to add properties to this object on the fly when throwing.
     *
     * @param propertyName {string}
     * @param value {*}
     *
     * @returns {ClientError}
     *      Returns this object for ability to chain method calls.
     */
    set(propertyName, value) {
        this[propertyName] = value;
        return this;
    }

    /**
     * @param message {string}
     * @returns {ClientError}
     */
    static create(message) {
        return new ClientError(message);
    }
}

export class ClientTimeoutError extends ClientError {}
export class ClientIllegalStateError extends ClientError {}
export class ClientInvalidParameterError extends ClientError {}

/*
 * Author: A.G.
 *   Date: 2019/10/03
 */

export const ERR_CONNECTION_CLOSED   = "ERR_CONNECTION_CLOSED";
export const ERR_CONNECTION_REQUIRED = "ERR_DISCONNECTED";
export const ERR_INVALID_ARGUMENT = "ERR_INVALID_ARGUMENT";
export const ERR_REQ_SOCKET_CLOSE = "ERR_XXX";
export const ERR_NOTIFICATION_TIMEOUT = "ERR_NOTIFICATION_TIMEOUT";
export const ERR_QUEUE_FULL = "ERR_QUEUE_FULL";
export const ERR_QUEUE_UPDATE = "ERR_QUEUE_UPDATE";
export const ERR_NOT_IMPLEMENTED = "ERR_NOT_IMPLEMENTED";

export const ERROR_MESSAGE = Object.freeze({
    [ ERR_CONNECTION_CLOSED ]: "connection closed",
    [ ERR_CONNECTION_REQUIRED ]: "this action requires established connection",
    [ ERR_INVALID_ARGUMENT ]: "Invalid argument",
    [ ERR_REQ_SOCKET_CLOSE ]: "Operation allowed on closed socket",
    [ ERR_NOTIFICATION_TIMEOUT ]: "Timeout is reached for notification await",
    [ ERR_QUEUE_FULL ]: "Queue is full",
    [ ERR_QUEUE_UPDATE ]: "Enqueued value is updated",
    [ ERR_NOT_IMPLEMENTED ]: "Method is not implemented"
});

export class HubClientError extends Error {
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
     * @returns {HubClientError}
     *      Returns this object for ability to chain method calls.
     */
    set(propertyName, value) {
        this[propertyName] = value;
        return this;
    }

    /**
     * Fabric method.
     */
    static create(message) {
        return new HubClientError(message);
    }

    /**
     * Fabric method.
     */
    static createCode(code, cause = null) {
        return HubClientError.create(ERROR_MESSAGE[code])
            .set("code", code)
            .set("cause", cause);
    }
}

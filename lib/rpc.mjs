/*
 * By:              A.G.
 * Created on:      2020.07.19
 * Last modified:   2020.07.19
 */

export const RPC_REGEX = new RegExp(/^(?<tag>\w+) (?<procName>\w+)(?: (?<argString>.+$))?/i); // Note single spaces.

export const RPC_RESULT_REGEX = new RegExp(/^(?<tag>\w+) (?<callResult>\d+)(?: (?<result>.+$))?/i); // Note single spaces.

export const RPC_CODE_TO_TEXT_MAP = Object.seal({
    "200": "success",
    "400": "bad parameters",
    "404": "unknown name",
    "500": "server-side error",
    "501": "not handled",
    "502": "timeout",
    "503": "RPC not available"
});

/**
 * Wrapper class for a remote procedure.
 */
export class RPC {

    #rpcName;
    #client;

    constructor(client, rpcName) {
        this.#client = client;
        this.#rpcName = rpcName;
    }

    invoke(procName, args, cb = undefined, timeout = undefined) {
        // TODO: Invokes the RPC with the provided arguments.
        this.#client.invokeRPC(this.#rpcName, args, cb, timeout);
    }

    get client() {
        return this.#client;
    }

}

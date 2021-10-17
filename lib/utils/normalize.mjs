/*
 * By:              A.G.
 * Created:         2020.02.09
 * Last modified:   2020.02.09
 */

/**
 * @param name                  {string|Array<string>}
 * @param namespaceDelimiter    {string}
 * @returns                     {string}
 * @throws TypeError
 */
export function normalizeTopicName(name, namespaceDelimiter) {
    if (Array.isArray(name)) {
        return name.join(namespaceDelimiter);
    } else {
        if (typeof name === "string" && name.trim() !== "") {
            return name;
        }
        throw new TypeError(`Name must be a string or an array of strings (got ${typeof name}: ${name})`);
    }
}

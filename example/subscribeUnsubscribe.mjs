/*
 * By:              A.G.
 * Created:         2020.02.11
 * Last modified:   2020.02.11
 */

import { MediatorClient } from "./../index.mjs";

MediatorClient.create({ connectNow: false }).connect().then((client) => {
    console.log(`Connected!`);
}).catch(console.error);


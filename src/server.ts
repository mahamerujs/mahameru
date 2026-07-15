import { MahameruServerError } from "@mahameru/diatrema";

if (!process.send) {
    console.error(new MahameruServerError('Cannot get parent process!'));
    process.exit(1);
}

if (cluster.isPrimary) {
    process.send({ type: 'STARTED' } as MahameruIPCMessageServer);
}

import cluster from "node:cluster";
// import startCluster from "./cluster";
// import worker from "./worker";
import type { MahameruIPCMessageServer } from './types';

(async () => {
    try {
        // const { ROOT_PATH, dev, host, port, multiCore } = await ensureServerEnvironment();

        // if (multiCore !== 0 && cluster.isPrimary) {
        //     startCluster({ rootPath: ROOT_PATH, host, port, dev });
        // } else {
        //     await worker({ rootPath: ROOT_PATH, dev, host, port });
        // }
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
})();

// async function ensureServerEnvironment() {
//     const dev = process.env.MAHAMERU__MODE?.trim() === 'development';
//     const port = process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT.trim()) : undefined;
//     const host = process.env.MAHAMERU__HTTP_LISTEN_HOST?.trim();
//     const ROOT_PATH = process.env.MAHAMERU__ROOT_PATH?.trim();
//     let multiCore = 0;

//     if (!ROOT_PATH)
//         throw new MahameruServerError('MAHAMERU__ROOT_PATH environment variable is not defined.');

//     if (process.env.MAHAMERU__MULTI_CORE) {
//         multiCore = parseInt(process.env.MAHAMERU__MULTI_CORE);

//         if (isNaN(multiCore))
//             multiCore = 0;
//     }

//     return {
//         dev,
//         port,
//         host,
//         ROOT_PATH,
//         multiCore
//     };
// }

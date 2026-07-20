import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import type { MahameruIPCMessageChild, MahameruIPCMessageServer } from "../types";
import { join } from "node:path";

let isShuttingDown = false;
let isAppReady = false;

type Options = {
    rootPath: string;
    host: string;
    port: number;
    dev: boolean;
};

export default async function startCluster(options: Options) {
    cluster.schedulingPolicy = cluster.SCHED_RR;
    cluster.setupPrimary({
        exec: join(process.cwd(), "node_modules", "mahameru", "cluster", "bootstrap.js"),
    });
    const numCPUs = availableParallelism();
    console.log(`[Mahameru CLI] Primary process ${process.pid} is orchestrating.`);

    for (let i = 0; i < numCPUs; i++)
        cluster.fork({
            MAHAMERU_ROOT: options.rootPath,
            MAHAMERU_HOST: options.host,
            MAHAMERU_PORT: String(options.port),
            MAHAMERU_DEV: String(options.dev),
        });

    console.log(`[Mahameru CLI] Enabled ${numCPUs} core(s).`);

    if (cluster.workers)
        console.log(`[Mahameru CLI] Workers: [${Object.values(cluster.workers).map(worker => worker!.process.pid).join(', ')}]\n`);

    cluster.on('exit', (worker, code, signal) => {
        if (!isShuttingDown) {
            console.error(`[Mahameru] Worker ${worker.process.pid} died (Code: ${code} / Signal: ${signal}). Reviving...`);
            cluster.fork({
                MAHAMERU_ROOT: options.rootPath,
                MAHAMERU_HOST: options.host,
                MAHAMERU_PORT: String(options.port),
                MAHAMERU_DEV: String(options.dev),
            });
        }
    });

    cluster.on('message', (_worker, message: MahameruIPCMessageServer) => {
        if (message.type === 'READY') {
            if (isAppReady)
                return;

            isAppReady = true;
            process.send?.(message);
        }
    });

    process.on('message', async (message: MahameruIPCMessageChild) => {
        if (message.type === 'SHUTDOWN') {
            isShuttingDown = true;

            const activeWorkers = Object.values(cluster.workers || {}).filter((worker): worker is NonNullable<typeof worker> => !!worker);

            if (activeWorkers.length === 0)
                process.exit(0);

            const workerDisconnections = activeWorkers.map((worker) =>
                new Promise<void>((resolve) => {
                    worker.on('disconnect', () => resolve());
                    worker.send(message);
                })
            );

            await Promise.all(workerDisconnections);

            process.exit(0);
        } else {
            const workersObj = cluster.workers || {};

            for (const id in workersObj) {
                workersObj[id]?.send(message);
            }
        }
    });

    const shutdown = async (signal: NodeJS.Signals) => {
        if (isShuttingDown)
            return;

        isShuttingDown = true;

        console.log(`[Mahameru CLI] Received ${signal} signal. Shutting down...`);

        try {

            process.exit(0);
        } catch (error) {
            console.error(error);

            process.exit(1);
        }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

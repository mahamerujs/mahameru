if (!process.send) {
    console.error(new MahameruServerError('Cannot get parent process!'));
    process.exit(1);
}

if (cluster.isPrimary) {
    process.send({ type: 'STARTED' } as MahameruIPCMessageServer);
}

import cluster from "node:cluster";
import { availableParallelism } from 'node:os';
import { MahameruServerError } from "./mahameru-server-error";
import { Mahameru } from "./mahameru";
import { MahameruIPCMessageChild, MahameruIPCMessageServer } from './types';
import { mahameruDefaultBaseConfig, mahameruDefaultConfig, type MahameruExtendedConfig } from "./config";

let startUsage = process.cpuUsage();
let startTime = process.hrtime.bigint();
let app: Mahameru | null = null;
let isShuttingDown = false;
let usageInterval: NodeJS.Timeout | null = null;

(async () => {
    try {
        let isAppReady = false;
        const { ROOT_PATH, SEND_PROCESS_USAGE_INTERVAL, dev, host, port, multiCore } = await ensureServerEnvironment();
        const extendedConfig: MahameruExtendedConfig = {
            ...mahameruDefaultBaseConfig,
            ...mahameruDefaultConfig,
            dev,
            rootPath: ROOT_PATH,
            appPath: !dev ? ROOT_PATH : mahameruDefaultBaseConfig.appPath,
            port: port ?? mahameruDefaultConfig.port,
            host: host ?? mahameruDefaultConfig.host
        };

        if (multiCore !== 0 && cluster.isPrimary) {
            cluster.schedulingPolicy = cluster.SCHED_RR;
            const numCPUs = multiCore === -1 ? availableParallelism() : multiCore;
            console.log(`[Mahameru CLI] Primary process ${process.pid} is orchestrating.`);

            sendProcessUsage();
            usageInterval = setInterval(() => sendProcessUsage(), SEND_PROCESS_USAGE_INTERVAL || 5000);

            for (let i = 0; i < numCPUs; i++)
                cluster.fork();

            console.log(`[Mahameru CLI] Enabled ${numCPUs} core(s).`);

            if (cluster.workers)
                console.log(`[Mahameru CLI] Workers: [${Object.values(cluster.workers).map(worker => worker!.process.pid).join(', ')}]\n`);

            cluster.on('exit', (worker, code, signal) => {
                if (!isShuttingDown) {
                    console.error(`[Mahameru] Worker ${worker.process.pid} died (Code: ${code} / Signal: ${signal}). Reviving...`);
                    cluster.fork();
                }
            });

            cluster.on('message', (worker, message: MahameruIPCMessageServer) => {
                if (message.type === 'READY') {
                    if (!isAppReady) {
                        isAppReady = true;
                        process.send?.(message);
                    }
                } else if (message.type === 'PROCESS_USAGE') {
                    process.send?.(message);
                }
            });

            process.on('message', async (message: MahameruIPCMessageChild) => {
                if (message.type === 'SHUTDOWN') {
                    isShuttingDown = true;

                    if (usageInterval)
                        clearInterval(usageInterval);

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
        } else {
            app = new Mahameru(extendedConfig);

            app.on('ready', ({ mode, port, host }) => {
                if (!process.send)
                    return;

                process.send({
                    type: 'READY',
                    data: {
                        pid: process.pid,
                        host,
                        port
                    }
                } as MahameruIPCMessageServer);
            });

            await app.initialize();

            process.on('message', async (message: MahameruIPCMessageChild) => {
                if (!process.send || !app || isShuttingDown)
                    return;

                switch (message.type) {
                    case 'DEV_HRM':
                        await app.devHRM(message.data.changedFile);
                        break;

                    case 'RELOAD':
                        console.log(`[Worker ${process.pid}] Reloading runtime state...`);
                        await app.reloadRuntimeState();
                        console.log(`[Worker ${process.pid}] Reloading runtime state... Done`);
                        break;

                    case 'RESTART':
                        console.log(`[Worker ${process.pid}] Restarting server...`);
                        await app.close();
                        await app.initialize();
                        console.log(`[Worker ${process.pid}] Restarting server... Done`);
                        break;

                    case 'SHUTDOWN':
                        isShuttingDown = true;
                        await app.close();
                        console.log(`[Worker ${process.pid}] Graceful Shutting down... Done`);

                        cluster.worker?.disconnect();
                        process.exit(0);

                        break;

                    default:
                        process.send({
                            type: 'ERROR',
                            data: { message: `Unknown message type: ${(message as any).type}` }
                        } as MahameruIPCMessageServer);
                        break;
                }
            });
        }

        const shutdown = async (signal: NodeJS.Signals) => {
            if (isShuttingDown || process.platform === 'win32')
                return;

            isShuttingDown = true;

            if (usageInterval)
                clearInterval(usageInterval);

            try {
                if (cluster.isWorker && app)
                    await app.close();

                process.exit(0);
            } catch (error) {
                console.error(error);

                process.exit(1);
            }
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
})();

async function ensureServerEnvironment() {
    const dev = process.env.MAHAMERU__MODE?.trim() === 'development';
    const port = process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT.trim()) : undefined;
    const host = process.env.MAHAMERU__HTTP_LISTEN_HOST?.trim();
    const ROOT_PATH = process.env.MAHAMERU__ROOT_PATH?.trim();
    const SEND_PROCESS_USAGE_INTERVAL = process.env.MAHAMERU__SEND_PROCESS_USAGE_INTERVAL ? parseInt(process.env.MAHAMERU__SEND_PROCESS_USAGE_INTERVAL) : undefined;
    let multiCore = 0;

    if (!ROOT_PATH)
        throw new MahameruServerError('MAHAMERU__ROOT_PATH environment variable is not defined.');

    if (process.env.MAHAMERU__MULTI_CORE) {
        multiCore = parseInt(process.env.MAHAMERU__MULTI_CORE);

        if (isNaN(multiCore))
            multiCore = 0;
    }

    return {
        dev,
        port,
        host,
        ROOT_PATH,
        SEND_PROCESS_USAGE_INTERVAL,
        multiCore
    };
}

async function sendProcessUsage() {
    if (!process.send)
        return;

    const raw = {
        cpu: process.cpuUsage(),
        memory: process.memoryUsage(),
        uptime: process.uptime()
    };

    const newUsage = raw.cpu;
    const newTime = process.hrtime.bigint();

    const elapUser = newUsage.user - startUsage.user;
    const elapSyst = newUsage.system - startUsage.system;
    const totalCpuTime = elapUser + elapSyst;
    const elapsedTime = Number(newTime - startTime) / 1000;

    let cpuPercent = "0.00";

    if (elapsedTime > 0)
        cpuPercent = (totalCpuTime / elapsedTime * 100).toFixed(2);

    startUsage = newUsage;
    startTime = newTime;

    const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

    const memory = {
        rss: toMB(raw.memory.rss),
        heapTotal: toMB(raw.memory.heapTotal),
        heapUsed: toMB(raw.memory.heapUsed),
        external: toMB(raw.memory.external),
    };

    const cpu = {
        user: (raw.cpu.user / 1000).toFixed(2) + ' ms',
        system: (raw.cpu.system / 1000).toFixed(2) + ' ms',
        usage: cpuPercent + '%'
    };

    const uptimeSeconds = Math.floor(raw.uptime);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    let uptimeParts: string[] = [];

    if (hours > 0)
        uptimeParts.push(`${hours}h`);

    if (minutes > 0 || hours > 0)
        uptimeParts.push(`${minutes}m`);

    uptimeParts.push(`${seconds}s`);

    const uptime = uptimeParts.join(' ');

    const payload: MahameruIPCMessageServer = {
        type: 'PROCESS_USAGE',
        data: { cpu, memory, uptime, raw }
    };

    process.send(payload);
}

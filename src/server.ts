import { Mahameru } from "./mahameru";
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MahameruIPCMessageServer } from './types';
import { MahameruServerError } from "./mahameru-server-error";
import { mahameruDefaultBaseConfig, mahameruDefaultConfig, type MahameruExtendedConfig, type Config, type MahameruConfig } from "./config";

let startUsage = process.cpuUsage();
let startTime = process.hrtime.bigint();
let app: Mahameru | null = null;

(async () => {
    try {
        const { ROOT_PATH, SEND_PROCESS_USAGE_INTERVAL, dev, host, port } = ensureServerEnvironment()

        const extendedConfig: MahameruExtendedConfig = {
            ...mahameruDefaultBaseConfig,
            ...mahameruDefaultConfig,
            rootPath: ROOT_PATH,
            appPath: !dev ? ROOT_PATH : mahameruDefaultBaseConfig.appPath,
            port: port ?? mahameruDefaultConfig.port,
            host: host ?? mahameruDefaultConfig.host
        }

        app = new Mahameru(extendedConfig);

        sendProcessUsage()

        setInterval(sendProcessUsage, SEND_PROCESS_USAGE_INTERVAL || 5000)

        await app.initialize();

        const shutdown = async (code?: number) => {
            if (process.send)
                return

            console.log(`Received ${code ? 'SIGINT' : 'SIGTERM'}`);

            try {
                await app?.close();

                process.exit(0);
            } catch (error) {
                console.error(error);

                process.exit(1);
            }
        }

        process.on('SIGKILL', shutdown);
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        console.error(error);

        if (process.send) {
            process.send({
                type: 'ERROR',
                data: error
            } as MahameruIPCMessageServer);

            setTimeout(() => {
                process.exit(1);
            }, 1000);

            return
        }

        if (error instanceof MahameruServerError) {
            console.error(error.message);
        } else {
            console.error(error);
        }

        if (app?.initialized)
            await app.close();

        process.exit(1);
    }
})()

function ensureServerEnvironment() {
    const dev = process.env.MAHAMERU__MODE?.trim() === 'development';
    const port = process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT.trim()) : undefined;
    const host = process.env.MAHAMERU__HTTP_LISTEN_HOST?.trim()
    const ROOT_PATH = process.env.MAHAMERU__ROOT_PATH?.trim()
    const CONFIG_FILE = process.env.MAHAMERU__CONFIG_FILE?.trim()
    const SEND_PROCESS_USAGE_INTERVAL = process.env.MAHAMERU__SEND_PROCESS_USAGE_INTERVAL ? parseInt(process.env.MAHAMERU__SEND_PROCESS_USAGE_INTERVAL) : undefined;

    if (!ROOT_PATH)
        throw new MahameruServerError('MAHAMERU__ROOT_PATH environment variable is not defined.');

    let configFilePath: string | null = null

    if (CONFIG_FILE) {
        configFilePath = join(ROOT_PATH, CONFIG_FILE);
        const packageJsonPath = join(ROOT_PATH, 'package.json');

        if (!existsSync(packageJsonPath))
            throw new MahameruServerError('Current directory is not a Node.js project. Cannot find package.json file.');

        if (!existsSync(configFilePath))
            configFilePath = null;
    }

    return {
        dev,
        port,
        host,
        ROOT_PATH,
        CONFIG_FILE,
        configFilePath,
        SEND_PROCESS_USAGE_INTERVAL
    }
}

async function sendProcessUsage() {
    if (process.send) {
        const newUsage = process.cpuUsage();
        const newTime = process.hrtime.bigint();

        const elapUser = newUsage.user - startUsage.user;
        const elapSyst = newUsage.system - startUsage.system;
        const totalCpuTime = elapUser + elapSyst;
        const elapsedTime = Number(newTime - startTime) / 1000;
        const cpuPercent = (totalCpuTime / elapsedTime * 100).toFixed(2);

        startUsage = newUsage;
        startTime = newTime;

        const rawData = {
            cpu: process.cpuUsage(),
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

        const memory = {
            rss: toMB(rawData.memory.rss),
            heapTotal: toMB(rawData.memory.heapTotal),
            heapUsed: toMB(rawData.memory.heapUsed),
            external: toMB(rawData.memory.external),
        };

        const cpu = {
            user: (rawData.cpu.user / 1000).toFixed(2) + ' ms',
            system: (rawData.cpu.system / 1000).toFixed(2) + ' ms',
            usage: cpuPercent + '%' // Menambahkan simbol % agar lebih jelas
        };

        const uptimeSeconds = Math.floor(rawData.uptime);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;

        let uptimeParts: string[] = [];

        if (hours > 0) {
            uptimeParts.push(`${hours}h`);
        }
        if (minutes > 0 || hours > 0)
            uptimeParts.push(`${minutes}m`);

        uptimeParts.push(`${seconds}s`);

        const uptime = uptimeParts.join(' ');

        const payload: MahameruIPCMessageServer = {
            type: 'PROCESS_USAGE',
            data: { cpu, memory, uptime, raw: rawData }
        }

        process.send(payload);
    }
}

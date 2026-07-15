import Diatrema from "@mahameru/diatrema";
import { devEnvironmentCheck } from "../utils/dev-environment-check";
import diatremaDependencies from "../dependencies-builder";
import { join } from "node:path";
import { freePortFinder } from "../utils/free-port-finder";
import { runTypescriptFile } from "../utils/run-typescript-file";
import { mahameruDefaultConfig, type MahameruConfigResult } from "../config";
import { loadEnvironmentVariables } from "../utils/load-env";
import type { FileChangedEventType } from "./type-checking-watcher";

export type DevServerParentProcessMessage =
    | { type: 'START' }
    | { type: 'RESTART' }
    | { type: 'SHUTDOWN' }
    | { type: 'FILE_CHANGED', filePath: string, eventType: FileChangedEventType }

export type DevServerStatus = 'RUNNING' | 'STARTING' | 'STARTED' | 'STOPING' | 'STOPPED';
export type DevServerChildProcessMessage =
    | { type: 'STATUS'; data: DevServerStatus }
    | { type: 'READY'; data: { port: number; host: string; mode: 'development' } }
    | { type: 'MESSAGE'; data: string }
    | { type: 'LOG'; data: string };

const sendMessage = (message: DevServerChildProcessMessage) =>
    new Promise<true>((resolve, reject) => {
        if (!process.send) {
            reject(new Error('Cannot send message. This script can only be run in a child process.'));

            return;
        }

        process.send(message, (error) => error ? reject(error) : resolve(true));
    });

const start = async (rootPath: string, host: string, port: number) => {
    loadEnvironmentVariables(true);
    const mahameruConfigFilePath = join(rootPath, 'mahameru.config.ts');
    let mahameruConfig = await runTypescriptFile<MahameruConfigResult>(mahameruConfigFilePath, { cleanup: true });

    if (!mahameruConfig) {
        mahameruConfig = {
            merged: {
                ...mahameruDefaultConfig,
                host,
                port
            },
            partial: {}
        }
    }

    if (mahameruConfig.partial?.host)
        host = mahameruConfig.partial.host;

    if (mahameruConfig.partial?.port)
        port = mahameruConfig.partial.port;

    if (!mahameruConfig.partial?.host)
        mahameruConfig.merged.host = host

    if (!mahameruConfig.partial?.port)
        mahameruConfig.merged.port = port

    mahameruConfig.merged.port = await freePortFinder(mahameruConfig.merged.port);

    process.send!({ type: 'MESSAGE', data: "Initializing Diatrema..." } as DevServerChildProcessMessage);

    const app = new Diatrema({
        rootPath,
        dev: true,
    },
        diatremaDependencies({
            dev: true,
            mahameruConfig: mahameruConfig.merged
        })
    );

    app.on('ready', ({ port, host, mode }) => {
        process.send!({ type: 'READY', data: { port, host, mode } } as DevServerChildProcessMessage);
    });

    await app.initialize();

    return app;
}

(async () => {
    try {
        if (typeof process.send !== 'function') {
            console.error('This script can only be run in a child process.');

            process.exit(1);
        }

        await sendMessage({ type: 'STATUS', data: 'RUNNING' });

        const rootPath = process.env.MAHAMERU__ROOT_PATH;
        let host = process.env.MAHAMERU__HTTP_LISTEN_HOST;
        let port = process.env.MAHAMERU__HTTP_LISTEN_PORT ? Number(process.env.MAHAMERU__HTTP_LISTEN_PORT) : undefined;

        if (!rootPath)
            throw new Error('MAHAMERU__ROOT_PATH environment variable is not set.');

        if (!host)
            throw new Error('MAHAMERU__HTTP_LISTEN_HOST environment variable is not set.');

        if (!port)
            throw new Error('MAHAMERU__HTTP_LISTEN_PORT environment variable is not set.');

        devEnvironmentCheck(rootPath);

        let app: Diatrema;

        const shutdown = async () => {
            if (process.platform === 'win32')
                return;

            if (app && app.initialized)
                await app.shutdown();

            process.exit(0);
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('message', async (message: DevServerParentProcessMessage) => {
            if (!message)
                return;

            if (message.type === 'START') {
                await sendMessage({ type: 'STATUS', data: 'STARTING' });

                app = await start(rootPath, host, port);
            } else if (message.type === 'SHUTDOWN') {
                await sendMessage({ type: 'STATUS', data: 'STOPING' });

                if (app && app.initialized)
                    await app.shutdown();

                await sendMessage({ type: 'STATUS', data: 'STOPPED' });

                process.exit(0);
            } else if (message.type === 'RESTART') {
                if (app && app.initialized)
                    await app.shutdown();

                app = await start(rootPath, host, port);
            } else if (message.type === 'FILE_CHANGED') {
                if (app && app.initialized)
                    await app.devHRM(message.filePath);
            }
        });

        await sendMessage({ type: 'STATUS', data: 'STARTED' });
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
})()

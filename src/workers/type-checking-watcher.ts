import { join } from "node:path";
import { MahameruDevServer, type TsErrorReport } from "../server/mahameru-dev-server";
import { devEnvironmentCheck } from "../utils/dev-environment-check";
import { rm } from "node:fs/promises";

export type TypeCheckingWatcherParentProcessMessage =
    | { type: 'START' }
    | { type: 'SHUTDOWN' };

export type TypeCheckingWatcherStatus = 'RUNNING' | 'STARTING' | 'STARTED' | 'STOPING' | 'STOPPED';
export type FileChangedEventType = 'create' | 'update' | 'delete';
export type TypeCheckingWatcherChildProcessMessage =
    | { type: 'STATUS'; data: TypeCheckingWatcherStatus }
    | { type: 'COMPILE_ERROR'; error?: string | undefined }
    | { type: 'STATUS_CHANGED'; message: string }
    | { type: 'FILE_CHANGED'; filePath: string; eventType: FileChangedEventType }
    | { type: 'SHUTDOWN' }
    | { type: 'MESSAGE'; data: string };

function sendMessage(message: TypeCheckingWatcherChildProcessMessage) {
    return new Promise<true>((resolve, reject) => {
        if (!process.send) {
            reject(new Error('Cannot send message. This script can only be run in a child process.'));

            return;
        }

        process.send(message, (error) => {
            if (error) {
                reject(error);

                return;
            }

            resolve(true);

            return;
        });
    })
}

(async () => {
    try {
        if (!process.send || typeof process.send !== 'function' || typeof process.send === 'undefined') {
            console.error('This script can only be run in a child process.');

            process.exit(1);
        }

        const rootPath = process.env.MAHAMERU__ROOT_PATH;

        if (!rootPath)
            throw new Error('MAHAMERU__ROOT_PATH environment variable is not set.');

        devEnvironmentCheck(rootPath);

        let serverReady = false;

        const tsConfigDevFilePath = join(rootPath, 'tsconfig.dev.json');
        let server: MahameruDevServer | null = null
        const errors: TsErrorReport[] = [];
        let hasError = false;
        const startHandler = async () => {
            sendMessage({ type: 'STATUS', data: 'STARTING' });

            const newServer = new MahameruDevServer({
                rootPath,
                tsConfigDevFilePath
            });

            newServer.on('compile-error', (error) => {
                errors.push(error);
            });

            newServer.on('status-changed', (message) => {
                if (message.includes('Watching for file changes.') && serverReady) {
                    if (errors.length > 0) {
                        hasError = true;
                        sendMessage({ type: 'COMPILE_ERROR', error: newServer.formatTypescriptError(errors) });

                        errors.length = 0;
                    } else {
                        if (hasError) {
                            hasError = false;
                            sendMessage({ type: 'COMPILE_ERROR', error: undefined });
                        }
                    }
                } else {
                    sendMessage({ type: 'STATUS_CHANGED', message });
                }
            })

            newServer.on('file-changed', (filePath, eventType) => {
                sendMessage({ type: 'FILE_CHANGED', filePath, eventType });
            });

            sendMessage({ type: 'MESSAGE', data: 'Generating types...' });
            await newServer.generator.start();

            sendMessage({ type: 'MESSAGE', data: 'Starting type checking server...' });
            await newServer.startTypeChecker();

            sendMessage({ type: 'MESSAGE', data: 'Generating aliases...' });
            await newServer.tscAlias();

            if (errors.length > 0) {
                sendMessage({ type: 'COMPILE_ERROR', error: newServer.formatTypescriptError(errors) });

                errors.length = 0;
            }

            await sendMessage({ type: 'STATUS', data: 'STARTED' });

            serverReady = true;
            server = newServer;
        }

        const shutdownHandler = async () => {
            if (server)
                server.stop();
            await rm(tsConfigDevFilePath, { force: true, recursive: true });

            process.exit(0);
        }

        const shutdown = async () => {
            if (process.platform === 'win32')
                return;

            await shutdownHandler();
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('message', async (message: TypeCheckingWatcherParentProcessMessage) => {
            if (message.type === 'SHUTDOWN') {
                await sendMessage({ type: 'STATUS', data: 'STOPING' });
                await shutdownHandler();
                await sendMessage({ type: 'STATUS', data: 'STOPPED' });

                process.exit(0);
            } else if (message.type === "START") {
                await startHandler();
            }
        });

        await sendMessage({ type: 'STATUS', data: 'RUNNING' });
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
})()

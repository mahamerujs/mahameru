import { join } from "node:path";
import { devEnvironmentCheck } from "../utils/dev-environment-check";
import { rm } from "node:fs/promises";
import TypescriptServer, { type TypescriptServerEvents, type TypescriptServerStatus } from "../server/typescript-server";
import pc from "picocolors";

export type TypescriptServerParentToChildMessage =
    | { type: 'START' }
    | { type: 'SHUTDOWN' };

export type FileChangedEventType = 'create' | 'update' | 'delete';

function sendMessage(message: Partial<TypescriptServerEvents>) {
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
        const tsConfigFilePath = join(rootPath, 'tsconfig.json');
        let server: TypescriptServer | null = null;
        const startHandler = async () => {
            await sendMessage({ "status-update": ['STARTING'] });

            const typescriptServer = new TypescriptServer({
                debug: process.env.MAHAMERU__DEBUG === 'true',
                rootPath,
                tsConfigFilePath,
                tsConfigDevFilePath,
                sourceDirPath: join(rootPath, 'src'),
                developmentDirPath: join(rootPath, '.mahameru')
            });

            typescriptServer.on('compile-error', async (errors) => {
                let error = errors.map(m => m.formatted).join('\n\n')
                error += pc.yellow(`\n\nWe found ${pc.white(errors.length)} errors in your code. Fix them and try again. Cheers! 🍻\n\n`);
                error += '\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n'

                await sendMessage({
                    'compile-error': [errors]
                });
            });

            typescriptServer.on('file-changed', (filePath, eventType, itemType) => {
                sendMessage({ "file-changed": [filePath, eventType, itemType] });
            });

            typescriptServer.on('status-update', async (status) => {
                await sendMessage({ 'status-update': [status] });

                if (!serverReady && status === 'READY') {
                    serverReady = true;
                    server = typescriptServer;

                    if (typescriptServer.errors.length > 0) {
                        let message = typescriptServer.errors.map(m => m.formatted).join('\n\n')
                        message += pc.yellow(`\n\nWe found ${pc.white(typescriptServer.errors.length)} errors in your code. Fix them and try again. Cheers! 🍻\n\n`);
                        message += '\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n'

                        setTimeout(async () => {
                            await sendMessage({
                                'compile-error': [typescriptServer.errors]
                            });
                        }, 250)
                    }
                }
            })

            typescriptServer.start();
        }

        const shutdownHandler = async () => {
            if (server)
                server.stop();

            await rm(tsConfigDevFilePath, { force: true, recursive: true });
        }

        const handleProcessOnMessage = async (message: TypescriptServerParentToChildMessage) => {
            if (message.type === 'SHUTDOWN') {
                await shutdownHandler();

                process.exit(0);
            } else if (message.type === "START") {
                await startHandler();
            }
        }

        const shutdown = (_signal: NodeJS.Signals) => {

        }

        process.on('SIGINT', shutdown);
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('SIGKILL', shutdown);
        process.on('message', handleProcessOnMessage);

        await sendMessage({ 'status-update': ['WORKER:STARTED'] });
    } catch (error) {
        console.error(error);
    }
})()

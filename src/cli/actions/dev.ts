import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";
import { devEnvironmentCheck } from "../../utils/dev-environment-check";
import ora, { type Ora } from "ora";
import { ChildProcess, fork, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { printServerReadyString } from "../../utils/printServerReady";
import cli from "../../utils/cli";
import type { TypeCheckingWatcherChildProcessMessage, TypeCheckingWatcherParentProcessMessage, TypeCheckingWatcherStatus } from "../../workers/type-checking-watcher";
import type { DevServerChildProcessMessage, DevServerParentProcessMessage, DevServerStatus } from "../../workers/dev-server";
import pc from 'picocolors';
import { MAHAMERU_TITLE } from "../../constants";

const __dirname = dirname(fileURLToPath(import.meta.url));
let appState: { port: number, host: string; mode: "development" | "production" } | null = null;
let version = '0.0.0';

export default function dev({ rootPath, version: originalVersion }: { rootPath: string; version: string }) {
    version = originalVersion;

    return async ({ host, port }: { host: string; port: number }) => {
        let shuttingDown = false;
        const shutdownTimeout = 3000;

        try {
            devEnvironmentCheck(rootPath);

            cli.clearScreen();

            const spinner = ora('Starting server...').start();
            screenUpdate(undefined, spinner, true);

            await rm(join(rootPath, '.mahameru'), { recursive: true, force: true });

            spinner.text = 'Starting...';

            let errors: string | undefined = undefined;
            let devServerInstance: ReturnTypeDevServer;

            const { child: typeCheckingWatcherProcess, start: startTypeCheckingWatcher } = await typeCheckingWatcher(rootPath, (message: TypeCheckingWatcherChildProcessMessage) => {
                if (message.type === 'COMPILE_ERROR') {
                    errors = message.error;

                    if (!appState)
                        return;

                    if (message.error) {
                        screenUpdate([message.error]);
                    } else {
                        screenUpdate(undefined);
                    }
                } else if (message.type === 'STATUS_CHANGED') {
                    if (message.message.includes('Starting compilation in watch mode')) {

                    } else if (message.message.includes('Starting incremental compilation')) {

                    } else if (message.message.includes('Watching for file changes')) {

                    } else {
                        console.log('[Type Checking Watcher]', message.message);
                    }
                } else if (message.type === 'FILE_CHANGED') {
                    if (devServerInstance) {
                        if (message.eventType === 'update')
                            devServerInstance.sendMessage({ type: 'FILE_CHANGED', filePath: message.filePath, eventType: message.eventType });
                    }
                    // console.log('[Type Checking Watcher]', message.filePath, message.eventType);
                } else if (message.type === 'MESSAGE') {
                    if (spinner.isSpinning)
                        spinner.text = message.data;
                }
            });

            spinner.text = 'Starting type checking watcher...';
            await startTypeCheckingWatcher();

            devServerInstance = await devServer(rootPath, (message) => {
                if (message.type === "MESSAGE") {
                    spinner.text = message.data;
                }
            }, version, host, port);

            spinner.text = 'Starting Mahameru Dev Server...';

            const data = await devServerInstance.start();

            spinner.stop();

            appState = {
                port: data.port,
                host: data.host,
                mode: data.mode
            }

            screenUpdate(errors ? errors : undefined, undefined);

            const shutdown = async (_signal: NodeJS.Signals) => {
                cli.cursor.show();

                if (shuttingDown)
                    return;

                shuttingDown = true;

                await new Promise(resolve => {
                    const timeout = setTimeout(() => {
                        console.warn("Watcher process took too long to shutdown. Forcing kill...");
                        typeCheckingWatcherProcess.kill('SIGKILL');
                        resolve(false);
                    }, shutdownTimeout);

                    typeCheckingWatcherProcess.on('exit', () => {
                        clearTimeout(timeout);
                        resolve(true);
                    });

                    if (typeCheckingWatcherProcess.connected) {
                        typeCheckingWatcherProcess.send({ type: 'SHUTDOWN' });
                    } else {
                        typeCheckingWatcherProcess.kill('SIGINT');
                    }
                });

                await new Promise(resolve => {
                    const timeout = setTimeout(() => {
                        console.warn("Dev server took too long to shutdown. Forcing kill...");
                        devServerInstance.child.kill('SIGKILL');
                        resolve(false);
                    }, shutdownTimeout);

                    devServerInstance.child.once('exit', () => {
                        clearTimeout(timeout);
                        resolve(true);
                    });

                    if (devServerInstance.child.connected) {
                        devServerInstance.sendMessage({ type: 'SHUTDOWN' });
                    } else {
                        devServerInstance.child.kill('SIGINT');
                    }
                });

                process.exit(0);
            }

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        } catch (error) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }

            process.exit(1);
        }
    }
}

const typeCheckingWatcher = async (rootPath: string, handleOnMessage: (message: TypeCheckingWatcherChildProcessMessage) => void = () => { }) => {
    let status: TypeCheckingWatcherStatus = 'STOPPED';

    const child = await new Promise<ChildProcess>(resolve => {
        const child = fork(join(__dirname, '..', '..', 'workers', 'type-checking-watcher.js'), {
            cwd: rootPath,
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: {
                MAHAMERU__ROOT_PATH: rootPath
            }
        });

        child.on('message', (message: TypeCheckingWatcherChildProcessMessage) => {
            handleOnMessage(message);

            if (message.type === 'STATUS') {
                status = message.data;

                if (status === 'RUNNING') {
                    resolve(child);
                }
            }
        });
    })

    const sendMessage = (message: TypeCheckingWatcherParentProcessMessage) => new Promise<true>((resolve, reject) => {
        child.send(message, (error) => error ? reject(error) : resolve(true));
    });

    return {
        status,
        sendMessage,
        start: () => new Promise(resolve => {
            const handleOnStarted = (message: TypeCheckingWatcherChildProcessMessage) => {
                if (message.type === 'STATUS' && message.data === 'STARTED') {
                    child.off('message', handleOnStarted);

                    resolve(true);
                }
            }

            child.on('message', handleOnStarted);

            sendMessage({ type: 'START' });
        }),
        child
    };
}

type ReturnTypeDevServer = {
    status: "STOPPED";
    child: ChildProcess;
    sendMessage: (message: DevServerParentProcessMessage) => Promise<true>;
    start: () => Promise<{
        port: number;
        host: string;
        mode: "development";
    }>;
};

const devServer = async (rootPath: string, handleOnMessage: (message: DevServerChildProcessMessage) => void, _version: string, host: string, port: number): Promise<ReturnTypeDevServer> => {
    let status: DevServerStatus = 'STOPPED';
    const child = await new Promise<ChildProcess>(resolve => {
        const devServerPath = join(__dirname, '..', '..', 'workers', 'dev-server.js');
        const child = spawn(process.execPath, [
            devServerPath
        ], {
            cwd: rootPath,
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: {
                ...process.env,
                MAHAMERU__DEV: 'true',
                MAHAMERU__ROOT_PATH: rootPath,
                MAHAMERU__HTTP_LISTEN_HOST: host,
                MAHAMERU__HTTP_LISTEN_PORT: String(port)
            }
        });

        child.on('message', (message: DevServerChildProcessMessage) => {
            handleOnMessage(message);

            if (message.type === 'STATUS') {
                status = message.data;

                if (status === 'RUNNING') {
                    resolve(child);
                }
            }
        });
    });

    const sendMessage = (message: DevServerParentProcessMessage) => new Promise<true>((resolve, reject) => {
        child.send(message, (error) => error ? reject(error) : resolve(true));
    });

    return {
        status,
        child,
        sendMessage,
        start: () => new Promise<{ port: number; host: string; mode: "development"; }>(resolve => {
            const handleOnStarted = (message: DevServerChildProcessMessage) => {
                if (message.type === 'READY') {
                    child.off('message', handleOnStarted);

                    resolve(message.data);
                }
            }

            child.on('message', handleOnStarted);

            sendMessage({ type: 'START' });
        })
    };
}

function screenUpdate(body: string | string[] | undefined, spinner?: Ora, showHeader: boolean = false) {
    const header = `${pc.bold(MAHAMERU_TITLE)} ${pc.dim(`v${version}`)}`;
    const content: string[] = []

    if (appState)
        content.push(...[printServerReadyString({ mode: appState.mode, host: appState.host, port: appState.port, version }), '']);

    if (body)
        if (Array.isArray(body)) {
            content.push(...body);
        } else {
            content.push(body);
        }

    cli.cursor.hide();
    cli.clearScreen();
    cli.updateScreen(showHeader ? header : undefined, content, spinner);
}

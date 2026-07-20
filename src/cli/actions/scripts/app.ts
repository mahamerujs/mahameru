import { ChildProcess, fork } from 'node:child_process';
import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type AppInstanceOptions = {
    dev: boolean;
    host: string;
    port: number;
    rootPath: string;
    entryFilePath: string;
    gracefulShutdownTimeout: number;
    printConsole: boolean;
    logDirPath: string;
    multiCore?: number
}

export class App {
    initialized = false;
    protected options: AppInstanceOptions = {
        dev: false,
        host: 'localhost',
        port: 3000,
        rootPath: process.cwd(),
        get entryFilePath(): string {
            return join(this.rootPath, 'node_modules', 'mahameru', 'server.js')
        },
        gracefulShutdownTimeout: 5000,
        printConsole: true,
        get logDirPath(): string {
            return join(this.rootPath, 'logs')
        }
    };
    protected child?: ChildProcess;
    protected appEnv: Record<string, string>;
    onMessage: (message: MahameruIPCMessageServer) => void = () => { };
    onError: (error: Error) => void = (error: Error) => console.error(error);
    onExit: (code: number) => void = (code: number) => {
        console.error(pc.red(`[Mahameru] Dev server exited with code ${Number(code)}.`));

        if (code !== 0)
            process.exit(code);
    };

    constructor(options: Partial<AppInstanceOptions>) {
        this.options = {
            ...this.options,
            ...options
        };
        this.appEnv = this.buildAppEnv();

        if (!existsSync(this.options.entryFilePath))
            throw new Error(`Cannot find entry file. Path: this.options.entryFilePath`);
    }

    async start(): Promise<void> {
        if (this.initialized)
            throw new Error('App has already been started.');

        this.child = fork(this.options.entryFilePath, {
            cwd: this.options.rootPath,
            env: this.appEnv,
            stdio: ['inherit', 'pipe', 'pipe', 'ipc']
        });

        this.child.stdout?.on('data', (data) => console.log(data.toString().trim()));
        this.child.stderr?.on('data', (data) => console.error(data.toString().trim()));

        this.initialized = true;

        this.setupListeners();

        return new Promise((resolve, reject) => {
            if (!this.child) {
                reject(new Error('Cannot find Mahameru child process.'));
                return;
            }

            const cleanup = () => {
                this.child?.removeListener('message', handleInitMessage);
                this.child?.removeListener('error', handleInitError);
            };

            const handleInitMessage = (message: MahameruIPCMessageServer) => {
                if (message.type === 'STARTED') {
                    cleanup();
                    resolve();
                } else if (message.type === 'ERROR') {
                    cleanup();
                    reject(new Error(message.data.message));
                }
            };

            const handleInitError = (error: Error) => {
                cleanup();
                const currentChild = this.child;
                this.initialized = false;
                this.child = undefined;

                if (currentChild) {
                    try { currentChild.kill(); } catch { }
                }
                reject(error);
            };

            this.child.on('message', handleInitMessage);
            this.child.on('error', handleInitError);
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.child || !this.initialized) {
                this.initialized = false;

                resolve();

                return;
            }

            this.child.removeListener('exit', this.onExit);

            let timeoutId: NodeJS.Timeout | null = null;

            this.child.once('close', (number, signal) => {
                if (timeoutId)
                    clearTimeout(timeoutId);

                this.initialized = false;
                this.child = undefined;

                resolve();
            })

            this.child.send({ type: 'SHUTDOWN' } as MahameruIPCMessageChild);

            if (typeof this.options.gracefulShutdownTimeout !== 'undefined' && this.options.gracefulShutdownTimeout > 0)
                timeoutId = setTimeout(() => {
                    if (this.child) {
                        console.warn(pc.yellow(`[Mahameru] Graceful shutdown timed out, killing child process.`));

                        this.child.disconnect();
                        this.child.kill();
                        resolve();
                    }
                }, this.options.gracefulShutdownTimeout);
        });
    }

    async devHRM(changedFile?: string) {
        if (!this.child)
            return;

        this.child.send({ type: 'DEV_HRM', data: { changedFile } } as MahameruIPCMessageChild);
    }

    protected setupListeners() {
        if (!this.child)
            return;

        this.child.on('message', this.onMessage);
        this.child.on('error', this.onError);
        this.child.on('exit', this.onExit);
    }

    protected buildAppEnv() {
        const env = {
            ...process.env,
            MAHAMERU__ROOT_PATH: this.options.rootPath,
            ...(this.options.dev ? { MAHAMERU__MODE: 'development' } : { MAHAMERU__MODE: 'production' }),
            ...(this.options.host ? { MAHAMERU__HTTP_LISTEN_HOST: this.options.host.trim() } : {}),
            ...(this.options.port ? { MAHAMERU__HTTP_LISTEN_PORT: this.options.port.toString().trim() } : {}),
            ...(this.options.multiCore ? { MAHAMERU__MULTI_CORE: this.options.multiCore.toString().trim() } : {})
        };

        return env;
    }
}

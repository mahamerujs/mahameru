import { EventEmitter } from "@mahameru/diatrema";
import { join, resolve } from "node:path";
import {
    createEmitAndSemanticDiagnosticsBuilderProgram,
    createWatchCompilerHost,
    createWatchProgram,
    FileWatcherEventKind,
    flattenDiagnosticMessageText,
    getLineAndCharacterOfPosition,
    sys,
    type BuilderProgram,
    type Diagnostic,
    type WatchOfConfigFile
} from 'typescript';
import pc from 'picocolors';
import { readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { replaceTscAliasPaths } from "tsc-alias";

type TypescriptServerOptions = {
    rootPath: string;
    tsConfigFilePath: string;
    tsConfigDevFilePath: string;
    developmentDirPath: string;
    sourceDirPath: string;
    debug: boolean;
};

export type TypescriptServerStatus = 'WORKER:STARTED' | 'GENERATING-TYPES' | 'STARTING' | 'READY' | 'TRANSPILING' | 'STOPPING' | 'STOPPED';

export type TypescriptServerEvents = {
    'file-changed': [filePath: string, eventType: 'create' | 'update' | 'delete', itemType: 'file' | 'folder'];
    'compile-error': [error: TypescriptError[]];
    'status-update': [status: TypescriptServerStatus];
};

export type TypescriptError = {
    type: 'message' | 'file';
    filePath?: string;
    line?: number;
    character?: number;
    message?: string;
    rawMessage: string;
    formatted: string;
}

export default class TypescriptServer extends EventEmitter<TypescriptServerEvents> {
    public readonly options: TypescriptServerOptions;
    protected watchProgram?: WatchOfConfigFile<BuilderProgram>;
    protected _errors: TypescriptError[] = [];
    protected pendingChanges = new Map<string, ['create' | 'update' | 'delete', 'file' | 'folder']>();
    protected isInitialBuildDone = false;
    protected _status: TypescriptServerStatus = 'STOPPED';

    constructor(options: TypescriptServerOptions) {
        super();
        this.options = options;
    }

    get status() {
        return this._status;
    }

    get errors() {
        return this._errors;
    }

    public start() {
        this.emit('status-update', 'STARTING');
        this._status = 'STARTING';

        const tsConfig = JSON.parse(readFileSync(this.options.tsConfigFilePath, 'utf-8'));
        const tsConfigDev = {
            ...tsConfig,
            compilerOptions: { ...tsConfig.compilerOptions },
            include: [...tsConfig.include]
        };

        writeFileSync(this.options.tsConfigDevFilePath, JSON.stringify(tsConfigDev, null, 2));

        const host = createWatchCompilerHost(
            this.options.tsConfigDevFilePath,
            {
                rootDir: this.options.sourceDirPath,
                outDir: this.options.developmentDirPath,
                noEmit: false,
                incremental: true,
                skipLibCheck: false,
                tsBuildInfoFile: join(this.options.developmentDirPath, 'tsbuildinfo.dev.json')
            },
            sys,
            createEmitAndSemanticDiagnosticsBuilderProgram,
            (diagnostic) => this.handleDiagnostic(diagnostic),
            (diagnostic) => {
                this.handleStatusDiagnostic(diagnostic);

                if ((diagnostic.code === 6194 || diagnostic.code === 6193) && !this.isInitialBuildDone) {
                    this.isInitialBuildDone = true;

                    this.tscAlias(async () => {
                        setImmediate(() => {
                            this.emit('status-update', 'READY');
                            this._status = 'READY';
                            rmSync(this.options.tsConfigDevFilePath, { force: true, recursive: true });
                        });
                    })
                }
            }
        );

        const originalAfterProgramCreate = host.afterProgramCreate;
        const originalWatchDirectory = host.watchDirectory;
        const originalWatchFile = host.watchFile;

        host.afterProgramCreate = (builderProgram) => {
            if (originalAfterProgramCreate)
                originalAfterProgramCreate(builderProgram);

            this.pendingChanges.forEach(([type, itemType], filePath) => {
                this.emit('file-changed', filePath, type, itemType);
            });

            this.pendingChanges.clear();
        };

        host.watchFile = (path, callback, pollingInterval, options) => {
            return originalWatchFile(path, (fileName, eventKind) => {
                callback(fileName, eventKind);

                const absolutePath = resolve(fileName);
                const isDir = this.isDirectory(absolutePath);

                if (isDir || (/\.tsx?$/.test(absolutePath) && !absolutePath.endsWith('.d.ts'))) {
                    let type: 'create' | 'update' | 'delete' = 'update';

                    if (eventKind === FileWatcherEventKind.Deleted) {
                        type = 'delete';
                    } else if (eventKind === FileWatcherEventKind.Created) {
                        type = 'create';
                    }

                    this.pendingChanges.set(absolutePath, [type, isDir ? 'folder' : 'file']);
                }
            }, pollingInterval, options);
        };

        host.watchDirectory = (path, callback, recursive, options) => {
            return originalWatchDirectory(path, (fileName) => {
                callback(fileName);

                const absolutePath = resolve(fileName);
                const isDir = this.isDirectory(absolutePath);

                let type: 'create' | 'update' | 'delete' = 'create';

                if (!sys.fileExists(absolutePath) && !sys.directoryExists(absolutePath))
                    type = 'delete';

                if (isDir || (/\.tsx?$/.test(absolutePath) && !absolutePath.endsWith('.d.ts')))
                    this.pendingChanges.set(absolutePath, [type, isDir ? 'folder' : 'file']);
            }, recursive, options);
        };

        this.watchProgram = createWatchProgram(host);
    }

    public stop() {
        if (this.watchProgram) {
            this.logger('Shutting down...');
            this.emit('status-update', 'STOPPING');
            this._status = 'STOPPING';
            this.watchProgram.close();
            this.watchProgram = undefined;
        }

        this.pendingChanges.clear();
        this._errors = [];
        this.emit('status-update', 'STOPPED');
        this._status = 'STOPPED';
        this.logger('Shutting down... Done.');
    }

    protected async tscAlias(callback: () => Promise<void>) {
        const tsconfigTsAliasFilePath = join(this.options.rootPath, 'tsconfig.tsalias.json');

        try {
            const tsconfig = JSON.parse(readFileSync(this.options.tsConfigDevFilePath, 'utf-8'));

            writeFileSync(tsconfigTsAliasFilePath, JSON.stringify({
                ...tsconfig,
                compilerOptions: {
                    ...(tsconfig.compilerOptions || {}),
                    rootDir: this.options.sourceDirPath,
                    outDir: this.options.developmentDirPath
                }
            }, null, 2));

            await replaceTscAliasPaths({
                configFile: tsconfigTsAliasFilePath,
                outDir: this.options.developmentDirPath,
                resolveFullPaths: true
            });
            await callback();
        } catch (aliasError: any) {
            console.error(pc.red(`Error running tsc-alias: ${aliasError.message || aliasError}`));

            process.exit(1);
        } finally {
            rmSync(tsconfigTsAliasFilePath, { force: true });
        }
    }

    protected handleDiagnostic(diagnostic: Diagnostic): void {
        const rawMessage = flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        let error: TypescriptError;

        if (diagnostic.file && diagnostic.start !== undefined) {
            let { line, character } = getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
            error = {
                type: 'file',
                message: `${diagnostic.file.fileName} (${line + 1},${character + 1}):\n${rawMessage}`,
                rawMessage, character, line,
                formatted: `${pc.red(pc.bold("[Typescript Error]"))} ${pc.underline(`${diagnostic.file.fileName}:${line + 1}:${character + 1}`)}:\n${pc.cyan(rawMessage)}`,
                filePath: diagnostic.file.fileName
            };
        } else {
            error = {
                rawMessage,
                formatted: `${pc.red(pc.bold("[Typescript Error]"))}: ${pc.cyan(rawMessage)}`,
                type: 'message',
            };
        }
        this._errors.push(error);
    }

    protected handleStatusDiagnostic(diagnostic: Diagnostic): void {
        const message = flattenDiagnosticMessageText(diagnostic.messageText, '\n');

        this.logger(message);

        if (message.startsWith('Starting compilation in watch mode')) {
            this._errors = [];
        } else if (message.startsWith('Found ') && message.includes('Watching for file changes.')) {
            if (!this.isInitialBuildDone)
                return;

            this.tscAlias(async () => {
                this.emit('compile-error', this._errors);
                this._errors = [];
            });
        }
    }

    private isDirectory(path: string): boolean {
        try {
            return statSync(path).isDirectory();
        } catch {
            return !/\.[a-zA-Z0-9]+$/.test(path);
        }
    }

    protected logger(...data: any[]) {
        if (!this.options.debug)
            return;

        console.log('[TypescriptServer]', ...data);
    }
}

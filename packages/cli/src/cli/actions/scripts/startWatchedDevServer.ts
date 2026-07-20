import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { SingleFileReplacer } from 'tsc-alias';
import {
    type Diagnostic,
    type EmitAndSemanticDiagnosticsBuilderProgram,
    type FormatDiagnosticsHost,
    type SourceFile,
    type WatchCompilerHostOfConfigFile,
    type WatchOfConfigFile,
    type WriteFileCallback
} from 'typescript';

import ora from 'ora'

import pc from 'picocolors'
import { Watchman } from './watchman';
import { DevEnvironment } from './types';
import { App, AppInstanceOptions } from './app';
import { createRequire } from 'node:module';
import { generateBarrelIndexFile, generateDataSourceTypes, generateMahameruDts, generateRouteTypes } from './generate-dynamic-types';

const nodeRequire = createRequire(__filename);

const rootPath = process.cwd();
const developmentDir = '.mahameru';
const DEV_DIST_DIR = join(rootPath, developmentDir);
const DEV_RUNTIME_DIR = DEV_DIST_DIR;
const SOURCE_ROOT_DIR = join(rootPath, 'src');
const DEV_TSCONFIG_PATH = join(rootPath, 'tsconfig.json');
const RELOAD_DEBOUNCE_MS = 250;
const configFilePath = join(rootPath, 'mahameru.config.ts');

export async function startWatchedDevServer({
    environment,
    host,
    port,
    version
}: {
    environment: DevEnvironment;
    host?: string;
    port?: number;
    version: string;
}) {
    let app: App;
    let compilerWatch: WatchOfConfigFile<EmitAndSemanticDiagnosticsBuilderProgram> | null = null;
    let isShuttingDown = false;
    let reloadTimer: NodeJS.Timeout | null = null;
    let configDirty = false;
    let buildBusy = true;
    let fullRuntimeRebuildDirty = false;
    let lastBuildDurationMs = 0;
    const runtimeDirtyPaths = new Set<string>();
    const changedSourcePaths = new Set<string>();

    await generateRouteTypes(
        join(rootPath, 'src', 'routes'),
        join(DEV_DIST_DIR, 'types', 'routes.d.ts')
    );
    await generateDataSourceTypes(
        join(rootPath, 'src', 'databases'),
        join(DEV_DIST_DIR, 'types', 'dataSources.d.ts')
    );
    await generateBarrelIndexFile(join(DEV_DIST_DIR, 'types'));
    await generateMahameruDts(join(rootPath, 'mahameru.d.ts'));

    await mkdir(DEV_DIST_DIR, { recursive: true });

    const spinnerInitialBuild = ora({
        text: `${pc.cyan('[Mahameru]')} Starting TypeScript watch...`,
        spinner: 'triangle'
    }).start();

    const flushBufferedReloads = () => {
        if (buildBusy || !app?.initialized || isShuttingDown) {
            return;
        }

        if (!configDirty && !fullRuntimeRebuildDirty && runtimeDirtyPaths.size === 0) {
            return;
        }

        scheduleReloadTimer();
    };

    const appOptions: Partial<AppInstanceOptions> = {
        dev: true,
        host,
        port,
        rootPath
    }

    app = new App(appOptions);

    compilerWatch = await startTypeScriptWatch({
        environment,
        spinner: spinnerInitialBuild,
        onBuildStart: () => {
            buildBusy = true;
        },
        onBuildSuccess: ({ durationMs, emittedRuntimeFiles, changedRuntimeSourceFiles, initialBuild }) => {
            lastBuildDurationMs = durationMs;
            buildBusy = false;

            if (!initialBuild) {
                for (const runtimeFilePath of emittedRuntimeFiles) {
                    runtimeDirtyPaths.add(runtimeFilePath);
                }

                for (const sourceFilePath of changedRuntimeSourceFiles) {
                    changedSourcePaths.add(sourceFilePath);
                }
            }

            flushBufferedReloads();
        },
        onBuildFailure: () => {
            buildBusy = false;
            lastBuildDurationMs = 0;
            fullRuntimeRebuildDirty = false;
            runtimeDirtyPaths.clear();
            changedSourcePaths.clear();

            if (reloadTimer) {
                clearTimeout(reloadTimer);
                reloadTimer = null;
            }
        }
    });

    spinnerInitialBuild.succeed(`${pc.green('[Mahameru]')} Initial build completed.\n`);

    await app.start();

    const watchman = new Watchman([
        DEV_DIST_DIR,
        configFilePath
    ]);
    const sourceWatchman = new Watchman(SOURCE_ROOT_DIR);
    let watcherQueue = Promise.resolve();

    const scheduleReloadTimer = () => {
        if (reloadTimer)
            clearTimeout(reloadTimer);

        reloadTimer = setTimeout(() => {
            watcherQueue = watcherQueue
                .then(async () => {
                    if (isShuttingDown || !app)
                        return;

                    if (buildBusy) {
                        scheduleReloadTimer();
                        return;
                    }

                    const pendingRuntimePaths = [...runtimeDirtyPaths];
                    const pendingSourceFilePaths = [...changedSourcePaths];
                    const shouldRunFullRuntimeRebuild = fullRuntimeRebuildDirty;
                    const shouldReloadConfig = configDirty;

                    configDirty = false;
                    fullRuntimeRebuildDirty = false;
                    runtimeDirtyPaths.clear();
                    changedSourcePaths.clear();
                    reloadTimer = null;

                    if (shouldReloadConfig) {
                        console.log(pc.yellow('\n [Mahameru] Config file changed. Reloading server...\n'));

                        await app.stop();

                        app = new App(appOptions)

                        console.clear();

                        await app.start();

                        return;
                    }

                    if (pendingRuntimePaths.length === 0)
                        if (!shouldRunFullRuntimeRebuild)
                            return;

                    const changedFile = pendingRuntimePaths[pendingRuntimePaths.length - 1];
                    const changedSourceFile = pendingSourceFilePaths[pendingSourceFilePaths.length - 1]
                        ?? (changedFile ? mapRuntimeFilePathToSourceFilePath(changedFile) : resolve(SOURCE_ROOT_DIR));
                    const reloadStartedAt = Date.now();

                    if (shouldRunFullRuntimeRebuild) {
                        await app.devHRM();
                    } else {
                        await app.devHRM(changedFile);
                    }

                    const reloadDurationMs = Date.now() - reloadStartedAt;
                    const totalDurationMs = lastBuildDurationMs + reloadDurationMs;

                    console.log(
                        `${pc.green('[Mahameru Dev]')} Rebuilt ${relative(rootPath, changedSourceFile).replace(/\\/g, '/')} build: ${lastBuildDurationMs}ms runtime: ${reloadDurationMs}ms total: ${totalDurationMs}ms`
                    );
                })
                .catch((error) => {
                    console.error(pc.red('[Mahameru Dev] Hot reload failed.'));
                    console.error(error);
                });
        }, RELOAD_DEBOUNCE_MS);
    };

    const scheduleReload = (kind: 'config' | 'runtime', filePath: string) => {
        if (kind === 'config') {
            configDirty = true;
        } else {
            runtimeDirtyPaths.add(filePath);
            changedSourcePaths.add(mapRuntimeFilePathToSourceFilePath(filePath));
        }

        if (buildBusy)
            return;

        scheduleReloadTimer();
    };

    watchman.on('all', ({ event, filePath }) => {
        const kind = classifyRuntimeArtifact(filePath);

        if (!kind)
            return;

        if (kind === 'runtime' && event !== 'delete' && event !== 'rename')
            return;

        scheduleReload(kind, filePath);
    });

    sourceWatchman.on('all', async ({ event, filePath, oldFilePath }) => {
        if (event !== 'delete' && event !== 'rename') {
            return;
        }

        const staleSourcePath = event === 'rename' && oldFilePath ? oldFilePath : filePath;

        if (!isSourceWatchTarget(staleSourcePath)) {
            return;
        }

        await removeStaleRuntimeArtifacts(staleSourcePath);
        fullRuntimeRebuildDirty = true;
        changedSourcePaths.add(resolve(staleSourcePath));

        if (buildBusy) {
            return;
        }

        scheduleReloadTimer();
    });

    await watchman.start();
    await sourceWatchman.start();

    const shutdown = async (exitCode = 0) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        if (reloadTimer) {
            clearTimeout(reloadTimer);
            reloadTimer = null;
        }

        watchman.stop();
        sourceWatchman.stop();
        // await deleteDirIfExists(DEV_DIST_DIR)
        await app.stop();
        compilerWatch?.close();
        // await rm(DEV_TSCONFIG_PATH, { force: true }).catch(() => undefined);
        process.exit(exitCode);
    };

    process.once('SIGINT', () => void shutdown(0));
    process.once('SIGTERM', () => void shutdown(0));

    await new Promise<void>(() => { });
}

async function startTypeScriptWatch(
    {
        environment,
        spinner,
        onBuildStart,
        onBuildSuccess,
        onBuildFailure
    }: {
        environment: DevEnvironment;
        spinner: ReturnType<typeof ora>;
        onBuildStart: () => void;
        onBuildSuccess: (result: {
            durationMs: number;
            emittedRuntimeFiles: string[];
            changedRuntimeSourceFiles: string[];
            initialBuild: boolean;
        }) => Promise<void> | void;
        onBuildFailure: () => void;
    }
): Promise<WatchOfConfigFile<EmitAndSemanticDiagnosticsBuilderProgram>> {
    const typescriptPath = resolve(join(rootPath, 'node_modules', 'typescript'));
    const {
        createWatchCompilerHost,
        createWatchProgram,
        formatDiagnosticsWithColorAndContext,
        formatDiagnostic,
        sys,
        createEmitAndSemanticDiagnosticsBuilderProgram
    } = nodeRequire(typescriptPath);
    const diagnosticsFormatHost: FormatDiagnosticsHost = {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => rootPath,
        getNewLine: () => sys.newLine
    };

    let initialBuildSettled = false;
    let cycleHasBuildErrors = false;
    let buildSequence = 0;

    const buildStartTimes = new Map<number, number>();
    const buildCycleEmits = new Map<number, {
        emittedRuntimeFiles: Set<string>;
        changedRuntimeSourceFiles: Set<string>;
    }>();

    let buildQueue = Promise.resolve();
    let resolveInitialBuild!: () => void;
    let rejectInitialBuild!: (error: Error) => void;

    const initialBuildReady = new Promise<void>((resolve, reject) => {
        resolveInitialBuild = resolve;
        rejectInitialBuild = reject;
    });

    const reportDiagnostic = (diagnostic: Diagnostic) => {
        cycleHasBuildErrors = true;
        const output = diagnostic.file
            ? formatDiagnosticsWithColorAndContext([diagnostic], diagnosticsFormatHost)
            : formatDiagnostic(diagnostic, diagnosticsFormatHost);

        process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
    };

    const reportWatchStatusChanged = (diagnostic: Diagnostic) => {
        const message = diagnostic.messageText.toString().trim();

        if (isTypeScriptWatchCycleStartMessage(message)) {
            buildSequence += 1;
            buildStartTimes.set(buildSequence, Date.now());
            buildCycleEmits.set(buildSequence, {
                emittedRuntimeFiles: new Set<string>(),
                changedRuntimeSourceFiles: new Set<string>()
            });
            cycleHasBuildErrors = false;
            onBuildStart();
        }

        if (isSuppressedTypeScriptWatchMessage(message))
            return;

        console.log(`${pc.yellow('[Mahameru TSC]')} ${message}`);
    };

    const host: WatchCompilerHostOfConfigFile<EmitAndSemanticDiagnosticsBuilderProgram> = createWatchCompilerHost(
        DEV_TSCONFIG_PATH,
        {
            rootDir: SOURCE_ROOT_DIR,
            outDir: DEV_DIST_DIR
        },
        sys,
        createEmitAndSemanticDiagnosticsBuilderProgram,
        reportDiagnostic,
        reportWatchStatusChanged
    );
    const ignoredWatchPath = normalizePath(resolve(join(DEV_DIST_DIR, 'types')));
    const shouldIgnoreWatchPath = (filePath: string) => {
        const normalized = normalizePath(resolve(filePath));
        return normalized === ignoredWatchPath || normalized.startsWith(`${ignoredWatchPath}/`);
    };

    const originalWatchFile = host.watchFile?.bind(host);

    if (originalWatchFile) {
        host.watchFile = (fileName, callback, pollingInterval, options) => {
            if (shouldIgnoreWatchPath(fileName)) {
                return { close() { } };
            }

            return originalWatchFile(fileName, callback, pollingInterval, options);
        };
    }

    const originalWatchDirectory = host.watchDirectory?.bind(host);

    if (originalWatchDirectory) {
        host.watchDirectory = (fileName, callback, recursive, options) => {
            if (shouldIgnoreWatchPath(fileName)) {
                return { close() { } };
            }

            return originalWatchDirectory(fileName, callback, recursive, options);
        };
    }

    const hostWithWriteFile = host as WatchCompilerHostOfConfigFile<EmitAndSemanticDiagnosticsBuilderProgram> & {
        writeFile?: WriteFileCallback;
    };
    const originalWriteFile = hostWithWriteFile.writeFile?.bind(hostWithWriteFile) ?? sys.writeFile.bind(sys);

    hostWithWriteFile.writeFile = (
        fileName,
        text,
        writeByteOrderMark,
        onError,
        sourceFiles,
        data
    ) => {
        originalWriteFile?.(fileName, text, writeByteOrderMark, onError, sourceFiles, data);
        recordEmitOutput(fileName, sourceFiles);
    };

    const originalAfterProgramCreate = host.afterProgramCreate;

    host.afterProgramCreate = (builderProgram) => {
        originalAfterProgramCreate?.(builderProgram);
        const cycleNumber = buildSequence === 0 ? 1 : buildSequence;
        buildSequence = cycleNumber;

        buildQueue = buildQueue
            .then(() => handleProgramCreate(builderProgram, cycleNumber))
            .catch((error) => {
                console.error(pc.red('[Mahameru Dev] Build lifecycle failed.'));
                console.error(error);
            });
    };

    const watch = createWatchProgram(host);

    async function handleProgramCreate(
        builderProgram: EmitAndSemanticDiagnosticsBuilderProgram,
        cycleNumber: number
    ) {
        const buildStartedAt = buildStartTimes.get(cycleNumber) ?? Date.now();
        const cycleEmitSummary = buildCycleEmits.get(cycleNumber) ?? {
            emittedRuntimeFiles: new Set<string>(),
            changedRuntimeSourceFiles: new Set<string>()
        };

        if (cycleHasBuildErrors) {
            if (!initialBuildSettled) {
                initialBuildSettled = true;
                spinner.fail(`${pc.red('[Mahameru]')} Initial TypeScript build failed.`);
                rejectInitialBuild(new Error('Initial TypeScript build failed.'));
            }

            buildCycleEmits.delete(cycleNumber);
            buildStartTimes.delete(cycleNumber);
            onBuildFailure();

            return;
        }

        try {
            if (!initialBuildSettled) {
                await waitForRuntimeArtifacts();
                const tscAliasPath = resolve(join(__dirname, 'node_modules', 'tsc-alias'));
                const { replaceTscAliasPaths } = nodeRequire(tscAliasPath);

                await replaceTscAliasPaths({
                    configFile: DEV_TSCONFIG_PATH,
                    outDir: DEV_DIST_DIR
                });
            } else {
                await rewriteRuntimeAliases([...cycleEmitSummary.emittedRuntimeFiles]);
            }
        } catch (error) {
            console.error(pc.red('[Mahameru Alias] Alias rewrite failed.'));
            console.error(error);

            if (!initialBuildSettled) {
                initialBuildSettled = true;
                spinner.fail(`${pc.red('[Mahameru]')} Initial alias rewrite failed.`);
                rejectInitialBuild(error instanceof Error ? error : new Error(String(error)));
            }

            buildCycleEmits.delete(cycleNumber);
            buildStartTimes.delete(cycleNumber);
            onBuildFailure();
            return;
        }

        const buildDurationMs = Date.now() - buildStartedAt;

        try {
            await onBuildSuccess({
                durationMs: buildDurationMs,
                emittedRuntimeFiles: [...cycleEmitSummary.emittedRuntimeFiles],
                changedRuntimeSourceFiles: [...cycleEmitSummary.changedRuntimeSourceFiles],
                initialBuild: !initialBuildSettled
            });
        } catch (error) {
            console.error(pc.red('[Mahameru Alias] Alias rewrite failed.'));
            console.error(error);
            onBuildFailure();
            return;
        } finally {
            buildCycleEmits.delete(cycleNumber);
            buildStartTimes.delete(cycleNumber);
        }

        if (!initialBuildSettled) {
            initialBuildSettled = true;
            resolveInitialBuild();
        }
    }

    function recordEmitOutput(fileName: string, sourceFiles?: readonly SourceFile[]) {
        const runtimeFilePath = resolve(fileName);
        const normalizedRuntimeFilePath = normalizePath(runtimeFilePath);
        const cycleEmitSummary = buildCycleEmits.get(buildSequence);

        if (!cycleEmitSummary || !isRuntimeJavaScriptOutput(normalizedRuntimeFilePath)) {
            return;
        }

        cycleEmitSummary.emittedRuntimeFiles.add(runtimeFilePath);

        for (const sourceFilePath of collectRuntimeSourceFilePaths(sourceFiles)) {
            cycleEmitSummary.changedRuntimeSourceFiles.add(sourceFilePath);
        }
    }

    try {
        await initialBuildReady;
        return watch;
    } catch (error) {
        watch.close();
        throw error;
    }
}

async function waitForRuntimeArtifacts(timeoutMs = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (existsSync(DEV_RUNTIME_DIR)) {
            await delay(200);
            return;
        }

        await delay(100);
    }

    throw new Error('Timed out waiting for emitted dev runtime artifacts.');
}

function classifyRuntimeArtifact(filePath: string): 'config' | 'runtime' | null {
    const resolvedFilePath = resolve(filePath);
    const normalizedFilePath = normalizePath(resolvedFilePath);
    const normalizedDevRoot = normalizePath(resolve(DEV_DIST_DIR));
    const normalizedRuntimeRoot = normalizePath(resolve(DEV_RUNTIME_DIR));
    const normalizedConfigPath = normalizePath(resolve(configFilePath));

    if (!normalizedFilePath.startsWith(`${normalizedDevRoot}/`) && normalizedFilePath !== normalizedConfigPath) {
        return null;
    }

    if (
        normalizedFilePath.endsWith('.d.ts') ||
        normalizedFilePath.endsWith('.map') ||
        normalizedFilePath.endsWith('.tsbuildinfo')
    ) {
        return null;
    }

    if (normalizedFilePath === normalizedConfigPath) {
        return 'config';
    }

    if (!normalizedFilePath.endsWith('.js')) {
        return null;
    }

    if (normalizedFilePath.startsWith(`${normalizedRuntimeRoot}/`)) {
        return 'runtime';
    }

    return null;
}

function isSuppressedTypeScriptWatchMessage(message: string) {
    const suppressedMessages = [
        'Starting compilation in watch mode...',
        'File change detected. Starting incremental compilation...',
        'Found 0 errors. Watching for file changes.',
        'Watching for file changes.'
    ];

    return suppressedMessages.some((suppressedMessage) => message.includes(suppressedMessage));
}

function isTypeScriptWatchCycleStartMessage(message: string) {
    return (
        message.includes('Starting compilation in watch mode...') ||
        message.includes('File change detected. Starting incremental compilation...')
    );
}

let singleFileAliasReplacerPromise: Promise<SingleFileReplacer> | null = null;

async function getSingleFileAliasReplacer() {
    if (!singleFileAliasReplacerPromise) {
        const tscAliasPath = resolve(join(__dirname, 'node_modules', 'tsc-alias'));
        const { prepareSingleFileReplaceTscAliasPaths } = nodeRequire(tscAliasPath);

        singleFileAliasReplacerPromise = prepareSingleFileReplaceTscAliasPaths({
            configFile: DEV_TSCONFIG_PATH,
            outDir: DEV_DIST_DIR
        });
    }

    return singleFileAliasReplacerPromise;
}

function isRuntimeJavaScriptOutput(filePath: string) {
    const normalizedRuntimeRoot = `${normalizePath(resolve(DEV_RUNTIME_DIR))}/`;

    return filePath.startsWith(normalizedRuntimeRoot)
        && filePath.endsWith('.js')
        && !filePath.endsWith('.d.ts')
        && !filePath.endsWith('.map');
}

function collectRuntimeSourceFilePaths(sourceFiles?: readonly SourceFile[]) {
    if (!sourceFiles) {
        return [];
    }

    const normalizedSourceRoot = `${normalizePath(resolve(SOURCE_ROOT_DIR))}/`;

    return sourceFiles
        .map((sourceFile) => resolve(sourceFile.fileName))
        .filter((sourceFilePath) => {
            const normalizedSourceFilePath = normalizePath(sourceFilePath);

            return normalizedSourceFilePath.startsWith(normalizedSourceRoot)
                && normalizedSourceFilePath.endsWith('.ts')
                && !normalizedSourceFilePath.endsWith('.d.ts');
        });
}

function mapRuntimeFilePathToSourceFilePath(runtimeFilePath: string) {
    const runtimeRelativePath = relative(DEV_RUNTIME_DIR, runtimeFilePath);

    return resolve(
        SOURCE_ROOT_DIR,
        runtimeRelativePath.replace(/\.js$/i, '.ts')
    );
}

function mapSourceFilePathToRuntimeFilePath(sourceFilePath: string) {
    const sourceRelativePath = relative(SOURCE_ROOT_DIR, sourceFilePath);

    return resolve(
        DEV_RUNTIME_DIR,
        sourceRelativePath.replace(/\.ts$/i, '.js')
    );
}

function isSourceWatchTarget(sourcePath: string) {
    const normalizedSourceRoot = `${normalizePath(resolve(SOURCE_ROOT_DIR))}/`;
    const normalizedSourcePath = normalizePath(resolve(sourcePath));

    return normalizedSourcePath.startsWith(normalizedSourceRoot);
}

async function removeStaleRuntimeArtifacts(sourcePath: string) {
    const resolvedSourcePath = resolve(sourcePath);
    const sourceRelativePath = relative(SOURCE_ROOT_DIR, resolvedSourcePath);

    if (sourceRelativePath.startsWith('..')) {
        return;
    }

    if (/\.[^\\/]+$/.test(sourceRelativePath)) {
        const runtimeFilePath = mapSourceFilePathToRuntimeFilePath(resolvedSourcePath);

        await Promise.all([
            rm(runtimeFilePath, { force: true }).catch(() => undefined),
            rm(`${runtimeFilePath}.map`, { force: true }).catch(() => undefined),
            rm(runtimeFilePath.replace(/\.js$/i, '.d.ts'), { force: true }).catch(() => undefined),
            rm(runtimeFilePath.replace(/\.js$/i, '.d.ts.map'), { force: true }).catch(() => undefined)
        ]);

        return;
    }

    await rm(resolve(DEV_RUNTIME_DIR, sourceRelativePath), {
        recursive: true,
        force: true
    }).catch(() => undefined);
}

async function rewriteRuntimeAliases(runtimeFilePaths: string[]) {
    if (runtimeFilePaths.length === 0) {
        return;
    }

    const aliasReplacer = (await getSingleFileAliasReplacer())!;

    for (const runtimeFilePath of runtimeFilePaths) {
        if (!existsSync(runtimeFilePath)) {
            continue;
        }

        const fileContents = await readFile(runtimeFilePath, 'utf8');
        const rewrittenContents = aliasReplacer({ fileContents, filePath: runtimeFilePath });

        if (rewrittenContents === fileContents) {
            continue;
        }

        await writeFile(runtimeFilePath, rewrittenContents);
    }
}

function normalizePath(value: string) {
    return value.replace(/\\/g, '/');
}

function delay(durationMs: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

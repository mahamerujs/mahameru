import { EventEmitter } from 'node:events';
import { join, resolve } from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import ts from 'typescript';
import pc from 'picocolors';
import { replaceTscAliasPaths } from 'tsc-alias';
import { Generator } from './generator';

export type MahameruDevServerOptions = {
  rootPath: string;
  tsConfigFile: string;
  tsConfigDevFile: string;
  tsConfigDevFilePath: string;
  moduleDirPath: string;
  tsConfigPath: string;
  productionDirPath: string;
  sourceDirPath: string;
};

export interface MahameruDevServerEvents {
  'file-changed': [filePath: string, eventType: 'create' | 'update' | 'delete'];
  'compile-error': [error: TsErrorReport, diagnostic: ts.Diagnostic];
  'status-changed': [message: string];
}

export type TsErrorReport = {
  type: 'message' | 'file';
  filePath?: string;
  line?: number;
  character?: number;
  message?: string;
  rawMessage: string;
};

export class MahameruDevServer extends EventEmitter {
  public name = 'Mahameru Dev Server';
  protected options: MahameruDevServerOptions;
  public generator: Generator;
  protected watchProgram?: ts.WatchOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram>;
  protected pendingChanges = new Map<string, 'create' | 'update' | 'delete'>();
  public override emit<K extends keyof MahameruDevServerEvents>(
    event: K,
    ...args: MahameruDevServerEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  public override on<K extends keyof MahameruDevServerEvents>(
    event: K,
    listener: (...args: MahameruDevServerEvents[K]) => void,
  ): this {
    return super.on(event, listener as any);
  }

  public override once<K extends keyof MahameruDevServerEvents>(
    event: K,
    listener: (...args: MahameruDevServerEvents[K]) => void,
  ): this {
    return super.once(event, listener as any);
  }

  constructor(initialOptions?: Partial<MahameruDevServerOptions>) {
    super();

    this.options = this.buildOptions(initialOptions);

    this.generator = new Generator({
      dev: true,
      modulesDir: 'modules',
      appPath: this.options.productionDirPath,
      routesDir: 'routes',
      outputTypesPath: join(this.options.productionDirPath, '.types'),
      rootPath: this.options.rootPath,
      sourceDirPath: this.options.sourceDirPath,
      debug: true,
    });
  }

  public startTypeChecker(): Promise<void> {
    return new Promise(async (resolvePromise) => {
      let isInitialBuildDone = false;
      const tsConfig = JSON.parse(await readFile(this.options.tsConfigPath, 'utf-8'));
      const tsConfigDev = {
        ...tsConfig,
        compilerOptions: {
          ...tsConfig.compilerOptions,
        },
        include: [...tsConfig.include],
      };

      await writeFile(this.options.tsConfigDevFilePath, JSON.stringify(tsConfigDev, null, 2));

      const host = ts.createWatchCompilerHost(
        this.options.tsConfigDevFilePath,
        {
          rootDir: resolve(this.options.sourceDirPath),
          outDir: this.options.productionDirPath,
          noEmit: false,
          incremental: true,
          skipLibCheck: false,
          tsBuildInfoFile: join(this.options.productionDirPath, 'tsbuildinfo.dev.json'),
        },
        ts.sys,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        (diagnostic) => this.handleDiagnostic(diagnostic),
        (diagnostic) => {
          this.handleStatusDiagnostic(diagnostic);

          if ((diagnostic.code === 6194 || diagnostic.code === 6193) && !isInitialBuildDone) {
            isInitialBuildDone = true;
            resolvePromise();
          }
        },
      );

      const originalAfterProgramCreate = host.afterProgramCreate;
      host.afterProgramCreate = (builderProgram) => {
        if (originalAfterProgramCreate) {
          originalAfterProgramCreate(builderProgram);
        }

        this.pendingChanges.forEach((type, filePath) => {
          this.emit('file-changed', filePath, type);
        });

        this.pendingChanges.clear();
      };

      const originalWatchFile = host.watchFile;
      host.watchFile = (path, callback, pollingInterval, options) => {
        return originalWatchFile(
          path,
          (fileName, eventKind) => {
            callback(fileName, eventKind);

            const absolutePath = resolve(fileName);
            if (/\.tsx?$/.test(absolutePath) && !absolutePath.endsWith('.d.ts')) {
              const type = eventKind === ts.FileWatcherEventKind.Changed ? 'update' : 'delete';

              this.pendingChanges.set(absolutePath, type);
            }
          },
          pollingInterval,
          options,
        );
      };

      const originalWatchDirectory = host.watchDirectory;
      host.watchDirectory = (path, callback, recursive, options) => {
        return originalWatchDirectory(
          path,
          (fileName) => {
            callback(fileName);

            const absolutePath = resolve(fileName);
            if (/\.tsx?$/.test(absolutePath) && !absolutePath.endsWith('.d.ts')) {
              if (ts.sys.fileExists(absolutePath)) {
                this.pendingChanges.set(absolutePath, 'create');
              }
            }
          },
          recursive,
          options,
        );
      };

      this.watchProgram = ts.createWatchProgram(host);
    });
  }

  public stop(): void {
    if (this.watchProgram) {
      this.watchProgram.close();
      this.watchProgram = undefined;
    }

    this.pendingChanges.clear();
  }

  public async build(): Promise<boolean> {
    try {
      if (!existsSync(this.options.tsConfigPath)) {
        console.error(pc.red(`Error: ${this.options.tsConfigPath} file not found.`));

        process.exit(1);
      }

      const { options, errors, fileNames } = await this.loadTsConfig();

      if (errors && errors.length > 0) {
        console.error(pc.red(`Error: ${errors[0].messageText}`));

        process.exit(1);
      }

      options.rootDir = this.options.sourceDirPath;
      options.outDir = this.options.productionDirPath;

      const host = ts.createCompilerHost(options);

      const compilerOptionsLookup = ts.createModuleResolutionCache(
        this.options.rootPath,
        host.getCanonicalFileName,
        options,
      );

      host.resolveModuleNameLiterals = (
        moduleLiterals,
        containingFile,
        redirectedReference,
        options,
      ) => {
        return moduleLiterals.map((moduleLiteral) => {
          return ts.resolveModuleName(
            moduleLiteral.text,
            containingFile,
            options,
            host,
            compilerOptionsLookup,
            redirectedReference,
          );
        });
      };

      const program = ts.createProgram({
        options,
        rootNames: fileNames,
        host: host,
      });

      const emitResult = program.emit();
      const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
      const errorReports: TsErrorReport[] = [];

      for (const diagnostic of allDiagnostics) {
        if (diagnostic.file) {
          let { line, character } = ts.getLineAndCharacterOfPosition(
            diagnostic.file,
            diagnostic.start!,
          );
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

          errorReports.push({
            type: 'file',
            message: `${diagnostic.file.fileName} (${line + 1},${character + 1}):\n${message}`,
            rawMessage: message,
            character,
            line,
            filePath: diagnostic.file.fileName,
          });
        } else {
          errorReports.push({
            rawMessage: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            type: 'message',
          });
        }
      }

      if (errorReports.length > 0) process.send?.({ type: 'ERROR', data: errorReports });

      if (!emitResult.emitSkipped) if (await this.buildMahameruConfig()) await this.tscAlias();

      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(pc.red('Error:'), error.message);
      } else {
        console.error(error);
      }

      process.exit(1);
    }
  }

  protected async buildMahameruConfig() {
    const mahameruConfigPath = join(this.options.rootPath, 'mahameru.config.ts');
    const { options, errors, fileNames } = await this.loadTsConfig();

    if (errors && errors.length > 0) {
      console.error(pc.red(`Error: ${errors[0].messageText}`));

      process.exit(1);
    }

    fileNames.length = 0;
    fileNames.push(mahameruConfigPath.replace(/\\/g, '/'));

    options.rootDir = this.options.rootPath;
    options.outDir = this.options.productionDirPath;

    const host = ts.createCompilerHost(options);

    const compilerOptionsLookup = ts.createModuleResolutionCache(
      this.options.rootPath,
      host.getCanonicalFileName,
      options,
    );

    host.resolveModuleNameLiterals = (
      moduleLiterals,
      containingFile,
      redirectedReference,
      options,
    ) => {
      return moduleLiterals.map((moduleLiteral) => {
        return ts.resolveModuleName(
          moduleLiteral.text,
          containingFile,
          options,
          host,
          compilerOptionsLookup,
          redirectedReference,
        );
      });
    };

    const program = ts.createProgram({
      options,
      rootNames: fileNames,
      host: host,
    });

    const emitResult = program.emit();
    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const errorReports: TsErrorReport[] = [];

    for (const diagnostic of allDiagnostics) {
      if (diagnostic.file) {
        let { line, character } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          diagnostic.start!,
        );
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

        errorReports.push({
          type: 'file',
          message: `${diagnostic.file.fileName} (${line + 1},${character + 1}):\n${message}`,
          rawMessage: message,
          character,
          line,
          filePath: diagnostic.file.fileName,
        });
      } else {
        errorReports.push({
          rawMessage: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          type: 'message',
        });
      }
    }

    if (errorReports.length > 0) process.send?.({ type: 'ERROR', data: errorReports });

    return emitResult.emitSkipped === false;
  }

  public async tscAlias() {
    const tsconfigBuildFilePath = join(this.options.rootPath, 'tsconfig.build.json');

    try {
      const tsconfig = JSON.parse(await readFile(this.options.tsConfigPath, 'utf-8'));

      await writeFile(
        tsconfigBuildFilePath,
        JSON.stringify(
          {
            ...tsconfig,
            compilerOptions: {
              ...(tsconfig.compilerOptions || {}),
              rootDir: this.options.sourceDirPath,
              outDir: this.options.productionDirPath,
            },
          },
          null,
          2,
        ),
      );

      await replaceTscAliasPaths({
        configFile: tsconfigBuildFilePath,
        outDir: this.options.productionDirPath,
        resolveFullPaths: true,
      });
    } catch (aliasError: any) {
      console.error(pc.red(`Error running tsc-alias: ${aliasError.message || aliasError}`));

      process.exit(1);
    } finally {
      await rm(tsconfigBuildFilePath, { force: true });
    }
  }

  protected async loadTsConfig(): Promise<ts.ParsedCommandLine> {
    try {
      const tsconfig = JSON.parse(await readFile(this.options.tsConfigPath, 'utf-8'));

      return ts.parseJsonConfigFileContent(tsconfig, ts.sys, this.options.rootPath);
    } catch (error) {
      console.error(pc.red(`Error:`), error);

      process.exit(1);
    }
  }

  protected handleDiagnostic(diagnostic: ts.Diagnostic): void {
    const rawMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    let error: TsErrorReport;

    if (diagnostic.file) {
      let { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file,
        diagnostic.start!,
      );

      error = {
        type: 'file',
        message: `${diagnostic.file.fileName} (${line + 1},${character + 1}):\n${rawMessage}`,
        rawMessage,
        character,
        line,
        filePath: diagnostic.file.fileName,
      };
    } else {
      error = {
        rawMessage,
        type: 'message',
      };
    }

    this.emit('compile-error', error, diagnostic);
  }

  protected handleStatusDiagnostic(diagnostic: ts.Diagnostic): void {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    this.emit('status-changed', message);
  }

  public formatTypescriptError(errors: TsErrorReport[]) {
    let message = errors
      .map((m) => {
        if (m.type === 'file')
          return `${pc.red(pc.bold('[Typescript Error]'))} ${pc.underline(`${m.filePath}:${m.line! + 1}:${m.character! + 1}`)}:\n${pc.cyan(m.rawMessage)}`;

        return `${pc.red(pc.bold('[Typescript Error]'))}: ${pc.cyan(m.rawMessage)}`;
      })
      .join('\n\n');

    message += pc.yellow(
      `\n\nWe found ${pc.white(errors.length)} errors in your code. Fix them and try again. Cheers! 🍻\n\n`,
    );
    message += '\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n';

    return message;
  }

  protected buildOptions(initialOptions?: Partial<MahameruDevServerOptions>) {
    const rootPath = initialOptions?.rootPath || process.cwd();
    const defaultOptions: MahameruDevServerOptions = {
      rootPath,
      tsConfigFile: 'tsconfig.json',
      tsConfigDevFile: 'tsconfig.dev.json',
      tsConfigDevFilePath: join(rootPath, 'tsconfig.dev.json'),
      tsConfigPath: join(rootPath, 'tsconfig.json'),
      moduleDirPath: join(rootPath, 'src', 'modules'),
      productionDirPath: join(rootPath, '.mahameru'),
      sourceDirPath: join(rootPath, 'src'),
    };

    if (!initialOptions) return defaultOptions;

    return {
      ...defaultOptions,
      ...initialOptions,
    };
  }
}

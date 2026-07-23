import {
  Diatrema,
  Plugin,
  type DiatremaOptions,
  diatremaDefaultConfig,
  type BasePluginOptions,
  createLogger,
  type Logger,
  EventEmitter,
} from '@mahameru/diatrema';
import { join } from 'node:path';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { TypescriptServerEvents, TypescriptServerStatus } from './server/typescript-server';
import type { Ora } from 'ora';
import type { TypescriptServerParentToChildMessage } from './workers/typescript-server';

export type MahameruOptions = DiatremaOptions & {
  outputTypesDirPath: string;
  sourceDirPath: string;
};

type MahameruGeneratorOptions = {
  dev: boolean;
  rootPath: string;
  outputTypesDirPath: string;
};

interface CustomNodeRequire {
  cache: Record<string, unknown>;
  resolve(id: string): string;
}

declare global {
  var mahameruEnv: Record<string, unknown> | undefined;
}

const mahameruDefaultOptions: MahameruOptions = {
  ...diatremaDefaultConfig,
  dev: process.env.NODE_ENV === 'development',
  outputTypesDirPath: join(diatremaDefaultConfig.rootPath, '.types'),
  sourceDirPath: join(diatremaDefaultConfig.rootPath, 'src'),
};

export type MahameruEvents = {
  ready: [mode: 'development' | 'production', data: { port?: number; host?: string }];
};

export class Mahameru extends EventEmitter<MahameruEvents> {
  protected readonly diatrema: Diatrema;
  protected _options: MahameruOptions;
  protected spinner?: Ora;
  protected logger: Logger;

  constructor(options?: Partial<MahameruOptions>, spinner?: Ora) {
    super();
    this._options = { ...mahameruDefaultOptions, ...options };
    this.logger = createLogger('Mahameru', this._options.debug);
    this.spinner = this._options.debug ? undefined : spinner;
    this.diatrema = new Diatrema(this._options);
  }

  get options(): MahameruOptions {
    return this._options;
  }

  public async start() {
    this.loadEnvironmentVariables();

    if (this._options.dev) {
      await this.startDevServer();
    } else {
      await this.startProdServer();
    }
  }

  public async shutdown() {
    this.logger.debug('Shutting down...');
    await this.typescriptServer.stop();
    await this.diatrema.shutdown();
    this.logger.debug('Shutting down... Done');
  }

  protected async startProdServer() {
    this.logger.debug('Starting production server...');

    await this.discoverPlugins();

    this.logger.debug('Starting Diatrema... Done');
  }

  protected async startDevServer() {
    this.logger.debug('Starting development server...');

    await this.generator().env();
    await this.discoverPlugins();
    await this.generator().mahameruDts();
    await this.generator().appendMahameruDTSToTsConfig();
    await this.typescriptServer.spawn();
    await this.typescriptServer.start();
    await this.diatrema.initialize();

    this.logger.debug('Starting development server... Done');
  }

  public typescriptServer = {
    status: 'STOPPED' as TypescriptServerStatus,
    process: null as ChildProcess | null,
    spawn: async (
      onMessage?: (message: Partial<TypescriptServerEvents>) => Promise<void> | void,
    ) => {
      this.logger.debug('Spawning Typescript server...');

      if (!onMessage)
        onMessage = async (message) => {
          if (message['compile-error']) {
            if (!this.typescriptServer) return;

            this.typescriptServer.errors =
              message['compile-error'][0].length > 0
                ? message['compile-error'][0].map((m) => m.formatted).join('\n\n')
                : undefined;

            if (this.typescriptServer.status !== 'READY') return;

            if (this.typescriptServer.errors) {
              // screenUpdate([message.error]);
              this.logger.error(this.typescriptServer.errors);
            } else {
              // screenUpdate(undefined);
            }
          } else if (message['status-update']) {
            const status = message['status-update'][0];

            if (this.spinner && this.spinner.isSpinning) {
              if (status === 'GENERATING-TYPES') {
                this.spinner.text = 'Generating types...';
              } else if (status === 'STARTING') {
                this.spinner.text = 'Starting Typescript server...';
              } else if (status === 'READY') {
                this.spinner.text = 'Typescript server ready!';
              }
            }
          } else if (message['file-changed']) {
            const [filePath, eventType, _itemType] = message['file-changed'];
            if (eventType === 'update') {
              await this.diatrema.devHRM(filePath);
            }
          }
        };

      this.typescriptServer.process = await new Promise<ChildProcess>((resolve) => {
        const workerFilePath = join(
          this.options.rootPath,
          'node_modules',
          'mahameru',
          'workers',
          'typescript-server.js',
        );
        const child = spawn(process.execPath, [workerFilePath], {
          cwd: this.options.rootPath,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: {
            MAHAMERU__ROOT_PATH: this.options.rootPath,
            MAHAMERU__ENV: 'development',
            MAHAMERU__DEBUG: this._options.debug ? 'true' : 'false',
          },
        });

        child.stdout?.on('data', (data) => {
          process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
          process.stderr.write(data);
        });

        const handleOnDisconnect = () => {
          this.logger.debug('disconnected');
        };

        const handleOnExit = (code: number | null, signal: NodeJS.Signals | null) => {
          this.logger.debug(
            `Typescript Server Child process mati mendadak! Code: ${code}, Signal: ${signal}`,
          );
        };

        child.on('disconnect', handleOnDisconnect);
        child.on('exit', handleOnExit);

        child.on('message', (message: Partial<TypescriptServerEvents>) => {
          onMessage(message);

          if (message['status-update']) {
            this.typescriptServer.status = message['status-update'][0];

            if (this.typescriptServer.status === 'WORKER:STARTED') {
              child.off('disconnect', handleOnDisconnect);
              child.off('exit', handleOnExit);

              resolve(child);
            }
          }
        });
      });

      this.logger.debug('Spawning Typescript server... Done');
    },
    start: () =>
      new Promise((resolve, reject) => {
        if (!this.typescriptServer.process) {
          reject(new Error('Please spawn Typescript server first.'));

          return;
        }

        const handleOnDisconnect = () => {
          this.logger.debug('disconnected');
        };

        const handleOnExit = (code: number | null, signal: NodeJS.Signals | null) => {
          this.logger.debug('Typescript Server Exit Code:', code, 'Signal:', signal);
        };

        this.typescriptServer.process.on('disconnect', handleOnDisconnect);
        this.typescriptServer.process.on('exit', handleOnExit);

        const handleOnStarted = (message: Partial<TypescriptServerEvents>) => {
          if (message['status-update'] && message['status-update'][0] === 'READY') {
            this.typescriptServer.process!.off('message', handleOnStarted);
            setTimeout(() => {
              this.typescriptServer.process!.off('disconnect', handleOnDisconnect);
              this.typescriptServer.process!.off('exit', handleOnExit);
            }, 1000);
            this.logger.debug('Starting Typescript server... Done');

            resolve(true);
          }
        };

        this.typescriptServer.process.on('message', handleOnStarted);

        this.logger.debug('Starting Typescript server...');

        this.typescriptServer.process.send({
          type: 'START',
        } as TypescriptServerParentToChildMessage);
      }),
    stop: async () => {
      return new Promise((resolve, reject) => {
        if (!this.typescriptServer.process) {
          reject(new Error('Please spawn Typescript server first.'));

          return;
        }

        this.logger.debug('Stopping Typescript server...');

        const timeout = setTimeout(() => {
          if (this.spinner)
            this.spinner.text = 'Typescript server took too long to shutdown. Forcing kill...';

          this.logger.debug('Typescript server took too long to shutdown. Forcing kill...');

          this.typescriptServer.process!.kill('SIGKILL');
          resolve(false);
        }, 3000);

        this.typescriptServer.process.on('exit', () => {
          clearTimeout(timeout);
          this.logger.debug('Stopping Typescript server... Done');
          resolve(true);
        });

        if (this.typescriptServer.process.connected) {
          this.typescriptServer.process.send({
            type: 'SHUTDOWN',
          } as TypescriptServerParentToChildMessage);
        } else {
          this.typescriptServer.process.kill('SIGINT');
        }
      });
    },
    errors: undefined as string | undefined,
  };

  public generator() {
    const generatorOptions: MahameruGeneratorOptions = {
      dev: true,
      rootPath: this._options.rootPath,
      outputTypesDirPath: this._options.outputTypesDirPath,
    };

    const generator = Mahameru.generator(generatorOptions, this.logger);

    return generator;
  }

  public static generator(
    { dev, rootPath, outputTypesDirPath }: MahameruGeneratorOptions,
    logger: Logger,
  ) {
    return {
      mahameruDts: async () => {
        const typeIndexFile = join(outputTypesDirPath, 'index.d.ts');

        if (!existsSync(typeIndexFile)) return;

        const toRelative = (path: string) => path.replace(rootPath, '.').replace(/\\/g, '/');
        const dTSContents = `/// <reference path="${toRelative(typeIndexFile)}" />\n\n// Do not edit this file, it is generated by MahameruJS\n`;

        const dTSfile = join(rootPath, 'mahameru.d.ts');
        await writeFile(dTSfile, dTSContents, { encoding: 'utf-8' });
      },
      appendMahameruDTSToTsConfig: async () => {
        const tsConfigPath = join(rootPath, 'tsconfig.json');
        const isExists = existsSync(tsConfigPath);

        try {
          const tsConfig = JSON.parse(await readFile(tsConfigPath, 'utf-8'));
          tsConfig.include = Array.isArray(tsConfig.include) ? tsConfig.include : [];

          if (!isExists) {
            const index = tsConfig.include.indexOf('mahameru.d.ts');

            if (index !== -1) tsConfig.include.splice(index, 1);

            return;
          }

          if (!tsConfig.include.includes('mahameru.d.ts')) tsConfig.include.push('mahameru.d.ts');

          await writeFile(tsConfigPath, JSON.stringify(tsConfig, null, 2), 'utf-8');
        } catch (error) {
          if (isExists) logger.error(`Failed to update tsconfig.json:`, error);
        }
      },
      env: async () => {
        {
          const defaultEnvFilePath = join(rootPath, '.env');
          const envFilePath = join(rootPath, `.env.${dev ? 'development' : 'production'}`);
          const envLocalFilePath = join(rootPath, '.env.local');
          const filesToLoad = [defaultEnvFilePath, envFilePath, envLocalFilePath];
          const envForMahameru: Record<string, string> = {};
          const outputTypesFilePath = join(outputTypesDirPath, 'mahameru-env.d.ts');

          if (!existsSync(outputTypesDirPath)) await mkdir(outputTypesDirPath, { recursive: true });

          for (const filePath of filesToLoad) {
            if (existsSync(filePath)) {
              try {
                const content = await readFile(filePath, 'utf-8');
                const lines = content.split(/\r?\n/);

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith('#')) continue;

                  const equalIndex = trimmed.indexOf('=');
                  if (equalIndex === -1) continue;

                  const key = trimmed.substring(0, equalIndex).trim();
                  let value = trimmed.substring(equalIndex + 1).trim();

                  if (key.startsWith('MAHAMERU__')) {
                    if (
                      (value.startsWith('"') && value.endsWith('"')) ||
                      (value.startsWith("'") && value.endsWith("'"))
                    ) {
                      value = value.slice(1, -1);
                    }

                    const cleanKey = key.replace(/^MAHAMERU__/, '');
                    envForMahameru[cleanKey] = value;
                  }
                }
              } catch (error) {
                logger.error(`Failed to read ${filePath}:`, error);
              }
            }
          }

          if (Object.keys(envForMahameru).length === 0) return;

          const properties = Object.keys(envForMahameru)
            .map((key) => `\treadonly ${key}: string;`)
            .join('\n');

          const template = `// Do not edit this file, it is generated by MahameruJS\n\ninterface MahameruGlobalEnv {\n${properties}\n}\n\ndeclare global {\n\tvar mahameruEnv: MahameruGlobalEnv;\n}\n\nexport {};\n`;

          try {
            await writeFile(outputTypesFilePath, template, 'utf-8');
          } catch (error) {
            logger.error(`Failed to generate env.d.ts:`, error);

            await rm(outputTypesDirPath, { force: true });
          }
        }
      },
      barrelIndexFile: async (dirPath: string) => {
        try {
          if (!existsSync(dirPath)) return;

          const items = await readdir(dirPath).catch((error) => {
            if (error.code === 'ENOENT') return [];

            throw error;
          });

          const exportLinesPromises = items.map(async (item) => {
            if (item.startsWith('index.')) return null;

            const fullPath = join(dirPath, item);
            const stats = await stat(fullPath);
            const isDirectory = stats.isDirectory();

            if (isDirectory || item.endsWith('.ts') || item.endsWith('.js')) {
              if (isDirectory) {
                const targetPath = '.' + '/' + item;

                return `export * from '${targetPath}'`;
              }

              const targetPath = '.' + '/' + item.split('.d')[0];

              return `export * from '${targetPath}'`;
            }

            return null;
          });

          const exportLines = (await Promise.all(exportLinesPromises)).filter(
            (value): value is string => value !== null,
          );

          if (exportLines.length === 0) return;

          const fileContent =
            '// Do not edit this file, it is generated by MahameruJS' +
            '\n\n' +
            exportLines.join('\n') +
            '\n';
          const outputPath = join(dirPath, 'index.d.ts');
          await writeFile(outputPath, fileContent, 'utf-8');
        } catch (error) {
          logger.error(`Failed to create index.d.ts:`, error);
        }
      },
    };
  }

  protected async discoverPlugins() {
    try {
      this.logger.debug('Discovering plugins...');
      const consumerPackagejsonPath = join(this._options.rootPath, 'package.json');
      this.logger.debug(`Loading ${consumerPackagejsonPath}...`);
      const consumerPackagejson = JSON.parse(await readFile(consumerPackagejsonPath, 'utf-8'));
      const allDependencies = {
        ...consumerPackagejson.dependencies,
        ...consumerPackagejson.devDependencies,
      };

      const potentialPluginNames = Object.keys(allDependencies).filter(
        (dep) => dep.startsWith('@mahameru/') && dep !== '@mahameru/diatrema',
      );

      this.logger.debug(
        `Found ${potentialPluginNames.length > 1 ? `${potentialPluginNames.length} plugins` : '1 plugin'}:`,
        potentialPluginNames.join(', '),
      );

      for (const name of potentialPluginNames) {
        try {
          const pluginDirPath = join(this.options.rootPath, 'node_modules', name);
          const pluginPkg = JSON.parse(
            await readFile(join(pluginDirPath, 'package.json'), 'utf-8'),
          );

          if (pluginPkg?.mahameru?.type !== 'plugin') continue;

          const module = await this.require<
            Record<
              'default',
              new (
                options?: BasePluginOptions,
                createLogger?: (name: string | string[], debug?: boolean) => Logger,
              ) => Plugin
            >
          >(join(pluginDirPath, 'index.js'));

          if (!module) {
            this.logger.warn(`Failed to load plugin: ${name}. Plugin not found`);

            continue;
          }

          if (!module.default)
            this.logger.debug(`Failed to load plugin: ${name}. No default export found`);

          const Plugin = module.default;
          const pluginInstance = new Plugin(
            { debug: this._options.debug, dev: this._options.dev },
            createLogger,
          );
          const shortPluginName = name.replace('@mahameru/', '');

          if (pluginInstance.generator) {
            const pluginOutputTypesDirPath = join(
              this._options.outputTypesDirPath,
              shortPluginName,
            );
            pluginInstance.generator.outputTypesDirPath = pluginOutputTypesDirPath;
            pluginInstance.generator.sourceDirPath = this._options.sourceDirPath;
            await pluginInstance.generator.generate();
            await this.generator().barrelIndexFile(pluginOutputTypesDirPath);
          }

          this.diatrema.setPlugin(shortPluginName, pluginInstance);

          this.logger.debug(`Loaded plugin ${name} from ${pluginDirPath}`);
        } catch (err) {
          this.logger.error(`Failed to load plugin: ${name}`, err);
        }
      }

      await this.generator().barrelIndexFile(this.options.outputTypesDirPath);
    } catch (error) {
      this.logger.error('Failed to discover plugins:', error);
    }

    this.logger.debug('Discovering plugins... Done');
  }

  protected loadEnvironmentVariables() {
    const dev = this._options.dev;
    const defaultEnvFilePath = join(this._options.rootPath, '.env');
    const envFilePath = join(this._options.rootPath, `.env.${dev ? 'development' : 'production'}`);
    const envLocalFilePath = join(this._options.rootPath, '.env.local');

    const filesToLoad = [defaultEnvFilePath, envFilePath, envLocalFilePath];

    const envForProcess: Record<string, string> = {};
    const envForMahameru: Record<string, string> = {};

    for (const filePath of filesToLoad) {
      if (existsSync(filePath)) {
        try {
          if (process.send)
            process.send({
              type: 'MESSAGE',
              data: `Loading environment variables from ${filePath}`,
            });

          const content = readFileSync(filePath, 'utf-8');
          const lines = content.split(/\r?\n/);

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) continue;

            const key = trimmed.substring(0, equalIndex).trim();
            let value = trimmed.substring(equalIndex + 1).trim();

            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }

            envForProcess[key] = value;

            if (key.startsWith('MAHAMERU__')) {
              const cleanKey = key.replace(/^MAHAMERU__/, '');
              envForMahameru[cleanKey] = value;
            }
          }
        } catch (error) {
          this.logger.error(`Failed to read ${filePath}:`, error);
        }
      }
    }

    if (Object.keys(envForProcess).length === 0) return;

    Object.assign(process.env, envForProcess);

    globalThis.mahameruEnv = {
      ...globalThis.mahameruEnv,
      ...envForMahameru,
    };
  }

  protected async require<T extends Record<string, unknown> = Record<string, unknown>>(
    resolvedFilePath: string,
  ): Promise<T | undefined> {
    const noCache = this.options.dev;

    if (!existsSync(resolvedFilePath)) return undefined;

    if (noCache) {
      const globalObj = globalThis as unknown as { require?: CustomNodeRequire };
      const globalRequire =
        typeof require !== 'undefined'
          ? (require as unknown as CustomNodeRequire)
          : globalObj.require;

      if (globalRequire?.cache) {
        try {
          const resolved = globalRequire.resolve(resolvedFilePath);
          delete globalRequire.cache[resolved];
        } catch {
          // ignore
        }
      }
    }

    let fileUrl = pathToFileURL(resolvedFilePath).href;

    if (noCache) {
      fileUrl += `?update=${Date.now()}`;
    }

    return (await import(fileUrl)) as T & { default?: T };
  }
}

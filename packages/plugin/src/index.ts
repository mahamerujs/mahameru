import { BaseClass } from '@mahameru/tephra';
import type { Container } from './container.js';
import type { Generator } from './generator.js';

export * from './container.js';
export * from './generator.js';

export interface BasePluginOptions {
  debug: boolean;
  dev: boolean;
}

export abstract class Plugin<O extends BasePluginOptions = BasePluginOptions> extends BaseClass<O> {
  public abstract readonly slugName: string;
  protected _container?: Container;
  protected _generator?: Generator;
  protected _plugins: Map<string, Plugin> = new Map();

  constructor(name: string, options: O) {
    super(name, options);
  }

  get initialized() {
    return this._initialized;
  }

  get generator() {
    return this._generator;
  }

  get container() {
    return this._container;
  }

  public setPlugins(plugins: Map<string, Plugin>) {
    this._plugins = plugins;
  }

  public async initialize(): Promise<void> {
    this.logger.debug('Initializing...');

    if (this._initialized) {
      this.logger.debug('Already initialized');

      return;
    }

    await this.boot();

    this.logger.debug('Initializing... Done');

    this._initialized = true;
  }

  public async destroy(): Promise<void> {
    if (!this._initialized || this._isShuttingDown) return;

    this.logger.debug('Destroying...');

    this._isShuttingDown = true;

    await this.terminate();

    this._initialized = false;
    this._isShuttingDown = false;

    this.logger.debug('Destroying... Done');
  }

  public async onDevHRM(changedFile: string): Promise<void | undefined> {
    if (!this._onDevHRM) return undefined;

    return await this._onDevHRM(changedFile);
  }

  protected _onDevHRM?(filePath: string): Promise<void> | void;
  protected abstract boot(options?: Partial<O>): Promise<void> | void;
  protected abstract terminate(): Promise<void> | void;
}

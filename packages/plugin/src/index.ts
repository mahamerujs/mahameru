import { type Logger } from './logger';

export interface BasePluginOptions {
  debug?: boolean;
  dev?: boolean;
}

export abstract class Plugin<O extends BasePluginOptions = BasePluginOptions> {
  public abstract readonly name: string;
  public abstract readonly slugName: string;
  protected logger?: Logger;
  protected _options: O;
  protected _initialized = false;
  protected _isShuttingDown = false;
  protected _generator?: Generator;

  constructor(options: Partial<O>) {
    this._options = options as O;
  }

  get initialized() {
    return this._initialized;
  }

  get options(): O {
    return this._options;
  }

  get generator() {
    return this._generator;
  }

  public async initialize(): Promise<void> {
    this.logger?.debug('Initializing...');

    if (this._initialized) {
      this.logger?.debug('Already initialized');

      return;
    }

    await this.boot();

    this.logger?.debug('Initializing... Done');

    this._initialized = true;
  }

  public async destroy(): Promise<void> {
    if (!this._initialized || this._isShuttingDown) return;

    this.logger?.debug('Destroying...');

    this._isShuttingDown = true;

    await this.terminate();

    this._initialized = false;
    this._isShuttingDown = false;

    this.logger?.debug('Destroying... Done');
  }

  public async onDevHRM(changedFile: string): Promise<void | undefined> {
    if (!this._onDevHRM) return undefined;

    return await this._onDevHRM(changedFile);
  }

  protected _onDevHRM?(filePath: string): Promise<void> | void;
  protected abstract boot(options?: Partial<O>): Promise<void> | void;
  protected abstract terminate(): Promise<void> | void;
}

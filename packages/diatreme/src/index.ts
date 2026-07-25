import { join } from 'node:path';

import { EventEmitter } from './event-emitter.js';
import { createLogger, type Logger } from './logger.js';

import type { Plugin } from '@mahameru/plugin';

export type DiatremeEvents = {
  ready: [data: { mode: 'development' | 'production'; port?: number; host?: string }];
};

export type DiatremeOptions = {
  dev: boolean;
  debug: boolean;
  rootPath: string;
  appPath: string;
  productionDir: string;
  developmentDir: string;
  initiatorFilePath?: string;
};

export const diatremeDefaultConfig: DiatremeOptions = {
  dev: false,
  debug: false,
  rootPath: process.cwd(),
  get appPath(): string {
    return join(this.rootPath, this.dev ? this.developmentDir : this.productionDir);
  },
  productionDir: '.mahameru',
  developmentDir: '.mahameru',
};

/**
 * Main Diatreme class that orchestrates the application lifecycle.
 */
export class Diatreme extends EventEmitter<DiatremeEvents> {
  protected _initialized = false;
  protected _isShuttingDown = false;
  protected _plugins = new Map<string, Plugin>();
  protected logger: Logger;
  public readonly options: DiatremeOptions;

  constructor(options?: Partial<DiatremeOptions>) {
    super();

    this.options = { ...diatremeDefaultConfig, ...options };
    this.logger = createLogger('Diatreme', this.options.debug);
  }

  /**
   * Indicates whether the Mahameru server has been initialized or not.
   * @returns {boolean}
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Indicates whether the Mahameru server is shutting down or not.
   * @returns {boolean}
   */
  get isShuttingDown() {
    return this._isShuttingDown;
  }

  get plugins(): Record<string, Plugin> {
    return Object.fromEntries(this._plugins);
  }

  public async initialize(): Promise<void> {
    if (this._initialized) return;

    this.logger.debug('Initializing...');

    for (const plugin of this._plugins.values()) {
      plugin.setPlugins(this._plugins);

      await plugin.initialize();
    }

    this._initialized = true;

    this.logger.debug('Initializing... Done');

    this.emit('ready', { mode: this.options.dev ? 'development' : 'production' });
  }

  public setPlugin<T extends Plugin>(pluginName: string, plugin: T) {
    this._plugins.set(pluginName, plugin);
  }

  public getPlugin<T extends Plugin>(pluginName: string): T | undefined {
    return this._plugins.get(pluginName) as T | undefined;
  }

  public async devHRM(changedFile?: string) {
    if (!this._initialized) return;

    if (changedFile) {
      for (const [_name, plugin] of this._plugins.entries()) {
        await plugin.onDevHRM(changedFile);
      }
    }
  }

  public async shutdown(): Promise<void> {
    if (this._isShuttingDown) return;

    this._isShuttingDown = true;

    this.logger.debug('Shutting down...');

    for (const plugin of this._plugins.values()) {
      await plugin.destroy();
    }

    this._initialized = false;
    this.logger.debug('Shutting down... Done');
  }
}

export * from './event-emitter.js';
export default Diatreme;

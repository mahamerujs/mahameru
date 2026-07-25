import type { Plugin } from './index.js';
import type { Logger } from './logger.js';

export interface BaseGeneratorOptions {
  debug?: boolean;
  dev?: boolean;
}

export abstract class Generator<O extends BaseGeneratorOptions = BaseGeneratorOptions> {
  protected logger!: Logger;
  protected _options: O;
  protected _sourceDirPath!: string;
  protected _outputTypesDirPath!: string;
  protected _plugins: Map<string, Plugin> = new Map();

  constructor(options: Partial<O>) {
    this._options = options as O;
  }

  set sourceDirPath(sourceDirPath: string) {
    this._sourceDirPath = sourceDirPath;
  }

  set outputTypesDirPath(outputTypesDirPath: string) {
    this._outputTypesDirPath = outputTypesDirPath;
  }

  public setPlugins(plugins: Map<string, Plugin>) {
    this._plugins = plugins;
  }

  public async generate() {
    if (!this._generate) return;

    this.logger.debug('Generating types...');
    const types = await this._generate();
    this.logger.debug('Types generated', types);
  }

  public async onDevHRM(changedFile: string) {
    if (!this._onDevHRM) return;

    await this._onDevHRM(changedFile);
  }

  protected _onDevHRM?(filePath: string): Promise<boolean>;
  protected abstract _generate?(): Promise<Record<string, unknown>>;
}

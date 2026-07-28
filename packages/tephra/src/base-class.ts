import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLogger, type Logger } from './logger.js';

interface Require {
  cache: Record<string, unknown>;
  resolve(id: string): string;
}

export interface BaseClassOptions {
  dev: boolean;
  debug: boolean;
}

export abstract class BaseClass<O extends BaseClassOptions = BaseClassOptions> {
  public readonly name: string;
  public readonly options: O;
  protected _initialized = false;
  protected _isShuttingDown = false;
  protected readonly logger: Logger;

  constructor(name: string, options: O) {
    this.name = name;
    this.options = options;
    this.logger = createLogger(name, options.dev);
  }

  /**
   * Indicates whether the Instance has been initialized or not.
   * @returns {boolean}
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Indicates whether the Instance is shutting down or not.
   * @returns {boolean}
   */
  get isShuttingDown() {
    return this._isShuttingDown;
  }

  protected async require<T extends Record<string, unknown> = Record<string, unknown>>(
    filePath: string,
  ): Promise<T | undefined> {
    const noCache = this.options.dev;

    if (!existsSync(filePath)) return undefined;

    if (noCache) {
      const globalObj = globalThis as unknown as { require?: Require };
      const globalRequire =
        typeof require !== 'undefined' ? (require as unknown as Require) : globalObj.require;

      if (globalRequire?.cache) {
        try {
          const resolved = globalRequire.resolve(filePath);
          delete globalRequire.cache[resolved];
        } catch {
          // ignore
        }
      }
    }

    let fileUrl = pathToFileURL(filePath).href;

    if (noCache) {
      fileUrl += `?update=${Date.now()}`;
    }

    return (await import(fileUrl)) as T & { default?: T };
  }
}

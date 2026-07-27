import { pathToFileURL } from 'node:url';
import type { Logger } from './logger.js';
import { existsSync } from 'node:fs';

export type BaseContainerOptions = {
  dev: boolean;
  debug: boolean;
};

interface Require {
  cache: Record<string, unknown>;
  resolve(id: string): string;
}

export class Container<O extends BaseContainerOptions = BaseContainerOptions> {
  protected logger?: Logger;
  protected _options: O;

  constructor(options: Partial<O>) {
    this._options = options as O;
  }

  protected async require<T extends Record<string, unknown> = Record<string, unknown>>(
    filePath: string,
  ): Promise<T | undefined> {
    const noCache = this._options.dev;

    if (!existsSync(filePath)) return undefined;

    if (noCache) {
      const globalObj = globalThis as unknown as { require?: Require };
      const globalRequire =
        typeof require !== 'undefined' ? (require as unknown as Require) : globalObj.require;

      if (globalRequire?.cache) {
        try {
          delete globalRequire.cache[globalRequire.resolve(filePath)];
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

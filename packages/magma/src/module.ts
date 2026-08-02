import { BaseClass } from '@mahameru/tephra';
import type { Container } from './container.js';
import { basename, dirname } from 'node:path';
import type { ClassConstructor } from './types.js';

type ModuleOptions = {
  dev: boolean;
  debug: boolean;
  modulesDirPath: string;
};

type ModuleItem = {
  service?: unknown;
  controller?: unknown;
};

export class Module extends BaseClass<ModuleOptions> {
  protected container: Container;
  #items: Map<
    string,
    {
      service?: { path: string; instance: unknown };
      controller?: { path: string; instance: unknown };
    }
  > = new Map();
  #modulesProxy: Record<string, ModuleItem> | null = null;

  constructor(options: ModuleOptions, container: Container) {
    super('MagmaModule', options);
    this.container = container;
  }

  get modules(): Record<string, ModuleItem> {
    if (!this.#modulesProxy) {
      this.#modulesProxy = new Proxy({} as Record<string, ModuleItem>, {
        get: (_target, moduleName: string) => {
          const item = this.#items.get(moduleName);

          if (!item) return undefined;

          return new Proxy(
            {},
            {
              get: (_subTarget, prop: string) => {
                if (prop === 'service') return item.service?.instance;
                if (prop === 'controller') return item.controller?.instance;
                return undefined;
              },
            },
          );
        },
        has: (_target, moduleName: string) => {
          return this.#items.has(moduleName);
        },
        ownKeys: () => {
          return Array.from(this.#items.keys());
        },
        getOwnPropertyDescriptor: (_target, moduleName: string) => {
          if (this.#items.has(moduleName)) {
            return {
              enumerable: true,
              configurable: true,
            };
          }
          return undefined;
        },
      });
    }

    return this.#modulesProxy;
  }

  public initialize() {
    this.loadModules();

    this._initialized = true;
  }

  protected loadModules() {
    for (const [fullPath, moduleItems] of this.container.items) {
      if (!fullPath.startsWith(this.options.modulesDirPath)) continue;

      const moduleName = basename(dirname(fullPath));

      if (fullPath.endsWith('service.js')) {
        const ServiceConstructor = moduleItems.find((item) => this.isClass(item.item))?.item as
          ClassConstructor | undefined;

        if (!ServiceConstructor) continue;

        const serviceInstance = new ServiceConstructor({ modules: this.modules });

        if (!this.#items.get(moduleName)) {
          this.#items.set(moduleName, { service: { path: fullPath, instance: serviceInstance } });
        } else {
          this.#items.get(moduleName)!.service = { path: fullPath, instance: serviceInstance };
        }
      }

      if (fullPath.endsWith('controller.js')) {
        const ControllerConstructor = moduleItems.find((item) => this.isClass(item.item))?.item as
          ClassConstructor | undefined;

        if (!ControllerConstructor) continue;

        const controllerInstance = new ControllerConstructor({ modules: this.modules });

        if (!this.#items.get(moduleName)) {
          this.#items.set(moduleName, {
            controller: { path: fullPath, instance: controllerInstance },
          });
        } else {
          this.#items.get(moduleName)!.controller = {
            path: fullPath,
            instance: controllerInstance,
          };
        }
      }
    }
  }

  protected isClass(item: unknown): boolean {
    if (typeof item !== 'function') return false;

    return /^class\s/.test(Function.prototype.toString.call(item));
  }
}

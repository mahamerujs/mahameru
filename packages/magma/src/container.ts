import { basename, dirname, join, relative, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { ModuleError } from './module-error';
import type {
    ClassConstructor,
    ContainerItem,
    ContainerRegistry,
    ErrorHandler,
    HTTPMethod,
    MagmaContainer,
    MagmaMiddleware,
    ProtectedRoute,
    RouteHandler,
    RouteItem
} from './types';
import { createLogger, type Logger } from '@mahameru/diatrema';

/**
 * Container options
 */
export type ContainerOptions = {
    dev: boolean;
    debug: boolean;
    routesDirPath: string;
    modulesDirPath: string;
    appDirPath: string;
    moduleType: "commonjs" | "esm";
}

export class Container {
    protected _initialized = false;
    protected _registry: ContainerRegistry = new Map();
    protected logger: Logger;

    constructor(public readonly options: ContainerOptions) {
        this.logger = createLogger(['Magma', 'Container'], this.options.debug)
    }

    get notFoundHandler() {
        const found = this._registry.values().find((item) => item.type === 'not-found');

        return found?.item || {};
    }

    get routeItems(): RouteItem[] {
        return Array.from(this._registry.values()).filter((item) => item.type === 'route').map((item) => item.item);
    }

    get middlewareHandler(): MagmaMiddleware | undefined {
        return this._registry.values().find((item) => item.type === 'middleware')?.item;
    }

    get errorHandler(): ErrorHandler | undefined {
        return this._registry.values().find((item) => item.type === 'error-handler')?.item;
    }

    get protectedRoutes(): ProtectedRoute {
        return this._registry.values().find((item) => item.type === 'protected-route')?.item || [];
    }

    get initialized() {
        return this._initialized;
    }

    get magmaContainer(): MagmaContainer {
        return new Proxy<MagmaContainer>({} as Record<string, unknown>, {
            get: (_target, firstProp) => {
                if (typeof firstProp !== 'string') return undefined;

                if (firstProp === 'modules') {
                    return new Proxy({}, {
                        get: (_moduleTarget, moduleName) => {
                            if (typeof moduleName !== 'string') return undefined;

                            return new Proxy({}, {
                                get: (_typeTarget, typeName) => {
                                    if (typeof typeName !== 'string') return undefined;

                                    for (const registry of this._registry.values()) {
                                        if (registry.isPublic && "moduleMeta" in registry && registry.moduleMeta) {
                                            if (
                                                registry.moduleMeta.module === moduleName &&
                                                registry.moduleMeta.type === typeName
                                            ) {
                                                return registry.item;
                                            }
                                        }
                                    }
                                    return undefined;
                                }
                            });
                        }
                    });
                }

                const camelCaseName = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

                for (const registry of this._registry.values()) {
                    if (registry.isPublic && camelCaseName(registry.name) === firstProp) {
                        return registry.item;
                    }
                }

                return undefined;
            }
        });
    }

    async discover() {
        await this.loadRoutes();
        await this.loadModules();
        await this.loadMiddlewareHandler();
        await this.loadNotFoundHandlers();
        await this.loadErrorHandler();

        this._initialized = true;
    }

    public async onDevHRM(filePath: string) {
        filePath = filePath.endsWith('.ts') ? filePath.replace('.ts', '.js') : filePath;

        if (filePath.includes('\\src\\'))
            filePath = filePath.replace('\\src\\', `\\.mahameru\\`);


        const found = this._registry.values().find((containerItem) => containerItem.path === filePath);

        this.logger.debug('onDevHRM', filePath);

        if (found) {
            if (found.type === 'route') {
                if (!this.options.routesDirPath)
                    return false;

                await this.loadSingleRoute(filePath, dirname(filePath), this.options.routesDirPath, dirname(filePath));
            } else if (found.type === 'middleware' || found.type === 'protected-route') {
                await this.loadMiddlewareHandler();
            } else if (found.type === 'module-service') {
                await this.loadModuleItem(filePath, 'module-service');
            } else if (found.type === 'module-controller') {
                await this.loadModuleItem(filePath, 'module-controller');
            }
        }

        return false;
    }

    protected async loadRoutes(currentDir?: string) {
        const baseDir = this.options.routesDirPath;

        if (!currentDir)
            currentDir = baseDir;

        const items = await readdir(currentDir, { withFileTypes: true }).catch(error => {
            if (error.code === 'ENOENT')
                return [];

            throw error;
        });

        for (const item of items) {
            const fullPath = join(currentDir, item.name);

            if (item.isDirectory()) {
                await this.loadRoutes(fullPath);

                continue;
            }

            if (!item.isFile() || item.name !== 'route.js')
                continue;

            await this.loadSingleRoute(fullPath, currentDir, baseDir, item.parentPath);
        }
    }

    protected async loadSingleRoute(fullPath: string, currentDir: string, baseDir: string, parentPath: string): Promise<boolean> {
        const relativePath = relative(baseDir, currentDir);

        let path = '/' + relativePath.replace(/\\/g, '/');
        path = path.replace(/\/+/g, '/');

        if (path.length > 1 && path.endsWith('/'))
            path = path.slice(0, -1);

        const paramNames: RouteItem['paramNames'] = [];
        const paramMatches = path.match(/\[([^\]]+)\]/g);

        if (paramMatches)
            paramMatches.forEach((match) => {
                paramNames.push(match.slice(1, -1));
            });

        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = escaped.replace(/\\\[([^\\\]]+)\\\]/g, '([^/]+)');
        const regex = new RegExp(`^${regexPattern}$`);
        const pathFS = resolve(fullPath);
        const routeHandlers = await this.require<Record<HTTPMethod, RouteHandler>>(this.options.moduleType, fullPath);

        if (routeHandlers) {
            this._registry.set(fullPath, {
                name: dirname(parentPath),
                path: fullPath,
                type: 'route',
                isPublic: false,
                item: {
                    paramNames: [...paramNames],
                    path,
                    pathFS,
                    regex,
                    routeHandlers
                }
            });

            return true;
        }

        return false;
    }

    protected async loadModules() {
        if (!this.options.modulesDirPath)
            return;

        const items = await readdir(this.options.modulesDirPath, { withFileTypes: true }).catch(error => {
            if (error.code === 'ENOENT')
                return [];

            throw error;
        });

        for (const item of items) {
            if (!item.isDirectory())
                continue;

            const directory = item;
            const controllerPath = join(this.options.modulesDirPath, directory.name, `controller.js`);

            if (!existsSync(controllerPath))
                continue;

            const controllerModule = await this.require<Record<string, ClassConstructor>>(this.options.moduleType, controllerPath);

            if (controllerModule) {
                const module = this.getDefaultExport<ClassConstructor>(controllerModule, controllerPath);
                const item = new module(this.magmaContainer);
                const name = module.name;

                this._registry.set(controllerPath, {
                    name,
                    path: controllerPath,
                    type: 'module-controller',
                    isPublic: true,
                    item,
                    moduleMeta: {
                        module: directory.name,
                        type: 'controller'
                    }
                })
            }

            const servicePath = join(this.options.modulesDirPath, directory.name, `service.js`)

            if (!existsSync(servicePath))
                continue;

            const serviceModule = await this.require<Record<string, ClassConstructor>>(this.options.moduleType, servicePath);

            if (serviceModule) {
                const module = this.getDefaultExport<ClassConstructor>(serviceModule, servicePath);
                const item = new module(this.magmaContainer);
                const name = module.name;

                this._registry.set(servicePath, {
                    name,
                    path: servicePath,
                    type: 'module-service',
                    isPublic: true,
                    item,
                    moduleMeta: {
                        module: directory.name,
                        type: 'service'
                    }
                })
            }
        }
    }

    protected async loadModuleItem(filePath: string, type: ContainerItem['type']) {
        const unknownModule = await this.require<Record<string, ClassConstructor>>(this.options.moduleType, filePath);

        if (!unknownModule)
            return;

        if (type === 'module-controller') {
            const module = this.getDefaultExport<ClassConstructor>(unknownModule, filePath);
            const item = new module(this.magmaContainer);
            const name = module.name;

            this._registry.set(filePath, {
                name,
                path: filePath,
                type: 'module-controller',
                isPublic: true,
                item,
                moduleMeta: {
                    module: basename(dirname(filePath)),
                    type: 'controller'
                }
            })
        } else if (type === 'module-service') {
            const module = this.getDefaultExport<ClassConstructor>(unknownModule, filePath);
            const item = new module(this.magmaContainer);
            const name = module.name;

            this._registry.set(filePath, {
                name,
                path: filePath,
                type: 'module-service',
                isPublic: true,
                item,
                moduleMeta: {
                    module: basename(dirname(filePath)),
                    type: 'service'
                }
            })
        }
    }

    protected async loadMiddlewareHandler(): Promise<boolean> {
        const middlawareHandlerPath = join(this.options.appDirPath, 'middleware.js');
        const result = await this.require<Record<'default' | 'protectedRoutes', MagmaMiddleware | ProtectedRoute>>(this.options.moduleType, middlawareHandlerPath);
        let success = false;

        if (result?.default && !Array.isArray(result.default)) {
            this._registry.set(`${middlawareHandlerPath}:default`, {
                name: 'default',
                path: middlawareHandlerPath,
                type: 'middleware',
                isPublic: false,
                item: result.default
            });

            success = true
        }

        if (result?.protectedRoutes && Array.isArray(result.protectedRoutes)) {
            this._registry.set(`${middlawareHandlerPath}:protectedRoutes`, {
                name: 'protectedRoutes',
                path: middlawareHandlerPath,
                type: 'protected-route',
                isPublic: false,
                item: result.protectedRoutes
            });

            success = true
        }

        return success;
    }

    protected async loadNotFoundHandlers() {
        const httpMethods: HTTPMethod[] = ['CONNECT', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE'];
        const notFoundHandlerPath = join(this.options.appDirPath, 'routes', 'not-found.js');
        const result = await this.require<Partial<Record<HTTPMethod, RouteHandler>>>(this.options.moduleType, notFoundHandlerPath);

        if (result && Object.keys(result).length > 0) {
            const filteredHandlers: Partial<Record<HTTPMethod, RouteHandler>> = {};

            (Object.keys(result) as HTTPMethod[]).forEach((key) => {
                if (!httpMethods.includes(key))
                    return;

                filteredHandlers[key] = result[key];
            });

            this._registry.set(`${notFoundHandlerPath}`, {
                name: 'not-found',
                path: notFoundHandlerPath,
                type: 'not-found',
                isPublic: false,
                item: result
            })
        }
    }

    protected async loadErrorHandler() {
        const errorHandlerPath = join(this.options.appDirPath, 'error.js');
        const result = await this.require<Record<'default', ErrorHandler>>(this.options.moduleType, errorHandlerPath);

        if (result) {
            const item = this.getDefaultExport<ErrorHandler>(result, errorHandlerPath);

            this._registry.set(`${errorHandlerPath}`, {
                name: 'error-handler',
                path: errorHandlerPath,
                type: 'error-handler',
                isPublic: false,
                item
            })
        }
    }

    protected getDefaultExport<T>(module: Record<string, T>, filePath: string) {
        const defaultExportName = Object.keys(module).find((key) => key === 'default');

        if (!defaultExportName)
            throw new ModuleError(`Module in file '${filePath}' does not have a default export.`, { path: filePath, moduleName: Object.keys(module)[0] });

        return module[defaultExportName];
    }

    protected async require<T extends Record<string, unknown> = Record<string, unknown>>(type: "commonjs" | "esm", resolvedFilePath: string): Promise<T | undefined> {
        const noCache = this.options.dev;

        if (!existsSync(resolvedFilePath))
            return;

        if (type === "commonjs") {
            if (noCache) {
                delete require.cache[resolvedFilePath];
            }

            return require(resolvedFilePath) as T;
        }

        let fileUrl = pathToFileURL(resolvedFilePath).href;

        if (noCache)
            fileUrl += `?update=${Date.now()}`;

        return (await import(fileUrl)) as T;
    }
}

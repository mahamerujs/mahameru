import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';

import { validateProtectedRoute } from './helpers';
import { MahameruHttpServerError } from './mahameru-http-server-error';
import { MahameruRequest } from './mahameru-request';
import { MahameruResponse } from './mahameru-response';
import { MahameruError } from './mahameru-error';
import type { MahameruIPCMessageChild, MahameruIPCMessageServer } from './types/mahameru-ipc-message'
import type { Config, MahameruConfig, MahameruExtendedConfig } from './config';
import { MahameruContainer } from './mahameru-container';
import type { TypeOrmDataSource } from './types/typeorm';

const runtimeRequire = createRequire(__filename);

export interface RouteItem {
    path: string;
    regex: RegExp;
    paramNames: string[];
    handlers: any;
    pathFS: string;
}

type RouteHandlerModule = Partial<Record<string, RouteHandler>>;

export type RouteHandlerContext = { params: Record<string, string> };

export type RouteHandler = (
    request: MahameruRequest,
    container: MahameruContainer,
    context: RouteHandlerContext
) => Promise<MahameruResponse> | MahameruResponse;

export interface MahameruMiddlewareContext {
    request: MahameruRequest;
    container: MahameruContainer;
    params: Record<string, string>;
    path: string;
    method: string;
}

export type MahameruNext = () => Promise<MahameruResponse>;

export type MahameruMiddleware = (
    context: MahameruMiddlewareContext,
    isProtectedRoute: boolean,
    next: MahameruNext
) => Promise<MahameruResponse> | MahameruResponse;

export type MahameruErrorHandlerContext = MahameruMiddlewareContext & { error: unknown };

export type MahameruErrorHandler = (
    context: MahameruErrorHandlerContext,
    next: MahameruNext
) => Promise<MahameruResponse> | MahameruResponse;

interface MahameruResponseLike {
    body: any;
    status: number;
    headers?: Headers | Record<string, string>;
}

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type RouteObject<T extends string = string> = {
    path: T;
    methods: HTTPMethod[];
};

export interface RegisterRoutes { }

export type ProtectedRoute = RegisterRoutes extends { routes: infer R }
    ? R[]
    : (string | RouteObject<string>)[];

type DefaultHTTPResponse = ServerResponse<IncomingMessage> & {
    req: IncomingMessage;
}

export interface PreInitContext {
    container: any;
}

export type PreInitHandler = (context: PreInitContext) => Promise<void>;

export class Mahameru {
    protected isInit = true;
    protected _initialized = false;
    protected routeRegistry: RouteItem[] = [];
    protected protectedRoutes: ProtectedRoute = [];
    protected middleware?: MahameruMiddleware;
    protected errorHandler?: MahameruErrorHandler;
    protected preInitHandler?: PreInitHandler;
    protected notFoundHandler?: RouteHandlerModule;
    protected httpServer: HttpServer | null = null;
    protected isShuttingDown = false;
    protected handleOnHttpClose?: () => void;
    protected container: MahameruContainer;
    protected config: MahameruExtendedConfig;
    protected dataSources: Record<string, TypeOrmDataSource> = {};
    protected dynamicTypePaths: string[] = [];

    constructor(
        config: MahameruExtendedConfig
    ) {
        this.config = config
        this.container = new MahameruContainer({
            modulesDir: join(this.config.appPath, this.config.modulesDir),
            dataSources: this.dataSources
        });
    }

    /**
     * Indicates whether the Mahameru server has been initialized or not.
     * @returns {boolean}
     */
    get initialized() {
        return this._initialized;
    }

    /**
     * Indicates whether the Mahameru server is in development mode or not.
     * @returns {boolean}
     */
    get developmentMode() {
        return process.env.MAHAMERU__MODE === 'development';
    }

    /**
     * Initialize the Mahameru server.
     */
    async initialize(): Promise<boolean> {
        await this.reloadRuntimeState();

        if (this.httpServer?.listening)
            await this.close();

        return new Promise((resolve, reject) => {
            this.httpServer = this.createHttpServer();
            this.handleOnHttpClose = () => {
                console.log('Mahameru HTTP Server closed.');
            }

            this.httpServer
                .listen(this.config.port, this.config.host)
                .on('listening', () => {
                    this._initialized = true;

                    this.setupIpcListener();

                    if (process.send) {
                        const payload: MahameruIPCMessageServer = {
                            type: 'READY',
                            data: {
                                pid: process.pid,
                                host: this.config.host,
                                port: this.config.port
                            }
                        };

                        process.send(payload);
                    }

                    this.isInit = false

                    resolve(true)
                })
                .on('error', (error) => {
                    if (error instanceof Error) {
                        reject(new MahameruHttpServerError(error.message));

                        return;
                    }

                    reject(error);
                })
                .on('close', this.handleOnHttpClose);
        });
    }

    async devHRM(targetFile?: string) {
        if (!this._initialized)
            return

        this.clearRuntimeRequireCache(targetFile);
        await this.reloadRuntimeState();
    }

    async close(): Promise<void> {
        if (this.isShuttingDown)
            return

        this.isShuttingDown = true;

        if (!this.httpServer) {
            this._initialized = false;

            return;
        }

        const server = this.httpServer;

        if (!server.listening) {
            this.httpServer = null;
            this._initialized = false;

            return;
        }

        console.log('Graceful Shutting down...');

        await this.closeHttpServer()

        console.log(`Graceful Shutting down... Done`);
    }

    protected closeHttpServer() {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.httpServer) {
                resolve()

                return
            }

            if (this.handleOnHttpClose)
                this.httpServer.removeListener('close', this.handleOnHttpClose);

            this.httpServer.close((error) => {
                if (error) {
                    reject(error);

                    return;
                }

                this.httpServer = null;
                this._initialized = false;

                resolve();
            });
        });
    }

    protected createHttpServer() {
        return createServer(async (request, response) => {
            const rawReqUrl = request.url?.split('?')[0] || '/';
            const matchUrl = this.normalizePathForMatching(rawReqUrl);
            const method = request.method || 'GET';
            const mahameruRequest = new MahameruRequest(request);
            const responseHeader = new Headers();
            const requestContext: Omit<MahameruMiddlewareContext, 'params'> & { params?: Record<string, string> } = {
                request: mahameruRequest,
                container: this.container,
                path: rawReqUrl,
                method
            };

            try {
                responseHeader.append('Content-Type', 'application/json');

                if (!this.config.disableHttpSignatureResponse) {
                    responseHeader.append('X-Powered-By', this.config.httpServerSignature);
                }

                response.setHeaders(responseHeader);

                if (
                    request.headers.origin &&
                    this.config.allowedOrigins &&
                    !this.config.allowedOrigins.includes(request.headers.origin)
                ) {
                    response.writeHead(403);
                    return response.end(JSON.stringify({ error: 'Forbidden' }));
                }

                if (this.config.trailingSlash === false && rawReqUrl.length > 1 && rawReqUrl.endsWith('/')) {
                    const cleanUrl = matchUrl;
                    const queryStr = request.url?.split('?')[1];
                    const redirectPath = cleanUrl + (queryStr ? `?${queryStr}` : '');

                    responseHeader.set('Location', redirectPath);

                    response.setHeaders(responseHeader);
                    response.writeHead(301);

                    return response.end(JSON.stringify({ message: 'Redirecting to non-trailing slash URL' }));
                }

                let { matchedRoute, matchResult } = this.findMatchedRoute(matchUrl);

                if (!matchedRoute) {
                    const notFoundResponse = await this.runNotFoundHandler(mahameruRequest, method, matchUrl);

                    return this.sendResponse(response, responseHeader, notFoundResponse ?? MahameruResponse.json(
                        { error: 'Not Found' },
                        { status: 404 }
                    ));
                }

                let handler: RouteHandler;

                if (this.developmentMode) {
                    try {
                        handler = this.loadDevRouteHandler(matchedRoute.pathFS, method);
                    } catch (e: any) {
                        if (e?.code === 'ENOENT') {
                            await this.reloadRuntimeState();
                            const refreshedMatch = this.findMatchedRoute(matchUrl);

                            matchedRoute = refreshedMatch.matchedRoute;
                            matchResult = refreshedMatch.matchResult;

                            if (!matchedRoute) {
                                const notFoundResponse = await this.runNotFoundHandler(mahameruRequest, method, matchUrl);

                                return this.sendResponse(
                                    response,
                                    responseHeader,
                                    notFoundResponse ?? MahameruResponse.json(
                                        { error: 'Not Found' },
                                        { status: 404 }
                                    )
                                );
                            }

                            try {
                                handler = this.loadDevRouteHandler(matchedRoute.pathFS, method);
                            } catch (retryError: any) {
                                if (retryError?.code === 'ENOENT') {
                                    const notFoundResponse = await this.runNotFoundHandler(mahameruRequest, method, matchUrl);

                                    return this.sendResponse(response, responseHeader, notFoundResponse ?? MahameruResponse.json(
                                        { error: 'Not Found' },
                                        { status: 404 }
                                    ));
                                }

                                response.writeHead(500);
                                return response.end(JSON.stringify({
                                    error: 'Mahameru Compilation/Runtime Error',
                                    message: retryError.message
                                }));
                            }
                        } else {
                            response.writeHead(500);
                            return response.end(JSON.stringify({
                                error: 'Mahameru Compilation/Runtime Error',
                                message: e.message
                            }));
                        }
                    }
                } else {
                    handler = matchedRoute.handlers[method];
                }

                if (!handler) {
                    response.writeHead(405);

                    return response.end(JSON.stringify({ error: `Method ${method} Not Allowed` }));
                }

                const params: Record<string, string> = {};

                if (matchResult && matchedRoute.paramNames.length > 0)
                    matchedRoute.paramNames.forEach((name, index) => {
                        params[name] = matchResult![index + 1];
                    });

                const mahameruResponse: MahameruResponse = this.middleware
                    ? await this.runMiddlewarePipeline(
                        this.middleware,
                        {
                            request: mahameruRequest,
                            container: this.container,
                            params,
                            path: rawReqUrl,
                            method
                        },
                        () => handler(mahameruRequest, this.container, { params })
                    )
                    : await handler(
                        mahameruRequest,
                        this.container,
                        { params }
                    );

                return this.sendResponse(response, responseHeader, mahameruResponse);
            } catch (error: any) {
                const errorResponse = await this.runErrorHandler(
                    error,
                    {
                        ...requestContext,
                        params: requestContext.params ?? {}
                    }
                );

                return this.sendResponse(response, responseHeader, errorResponse);
            }
        });
    }

    protected setupIpcListener(): void {
        if (!process.send)
            return;

        process.on('message', async (message: MahameruIPCMessageChild) => {
            try {
                await this.handleParentMessage(message);
            } catch (error) {
                console.error('Mahameru IPC Error:', error);
            }
        });
    }

    protected async handleParentMessage(message: MahameruIPCMessageChild): Promise<void> {
        if (typeof message !== 'object' || !("type" in message) || typeof message.type !== 'string' || !process.send)
            return

        switch (message.type) {
            case 'DEV_HRM':
                await this.devHRM(message.data.changedFile);

                break;

            case 'RELOAD':
                this.log('Reloading runtime state...');

                await this.reloadRuntimeState();

                this.log(`Reloading runtime state... Done`);

                break;

            case 'RESTART':
                this.log('Restarting server...');

                await this.close();
                await this.initialize();

                this.log(`Restarting server... Done`);

                break;

            case 'SHUTDOWN':
                await this.close();

                process.send({ type: 'SHUTDOWN_DONE' } as MahameruIPCMessageServer);

                return;

            default:
                process.send({ type: 'ERROR', data: { message: `Unknown message type: ${(message as any).type}` } } as MahameruIPCMessageServer);

                break;
        }
    }

    protected async scanRoutes(baseDir: string, currentDir: string = baseDir) {
        if (!existsSync(currentDir))
            throw new MahameruError(`Route directory "${currentDir}" does not exist.`);

        await this.generateRouteTypes();

        const items = await readdir(currentDir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(currentDir, item.name);

            if (item.isDirectory()) {
                await this.scanRoutes(baseDir, fullPath);

                continue;
            }

            const isRouteFile = item.name === 'route.js';

            if (item.isFile() && isRouteFile) {
                const relativePath = relative(baseDir, currentDir);

                let urlPath = '/' + relativePath.replace(/\\/g, '/');
                urlPath = urlPath.replace(/\/+/g, '/');

                if (urlPath.length > 1 && urlPath.endsWith('/')) {
                    urlPath = urlPath.slice(0, -1);
                }

                const paramNames: string[] = [];
                const paramMatches = urlPath.match(/\[([^\]]+)\]/g);

                if (paramMatches) {
                    paramMatches.forEach(match => {
                        paramNames.push(match.slice(1, -1));
                    });
                }

                const regexPattern = urlPath.replace(/\[([^\]]+)\]/g, '([^/]+)').replace(/\//g, '\\/');
                const routeRegex = new RegExp(`^${regexPattern}$`);

                const pathFS = resolve(fullPath);

                let handlers = null;

                if (!this.developmentMode) {
                    handlers = this.loadModule(fullPath);
                }

                this.routeRegistry.push({
                    path: urlPath,
                    regex: routeRegex,
                    paramNames,
                    handlers,
                    ...({ pathFS } as any)
                });
            }
        }
    }

    protected async generateDataSourcesTypes() {
        if (this.isInit)
            return

        const lines = Object.keys(this.dataSources).map((name) => `    ${name}: DataSource;`);
        const hasDataSources = lines.length > 0;
        const dataSourceTemplate = hasDataSources
            ? `// Do not edit this file, it is generated by MahameruJS\n\nimport type { DataSource } from "typeorm";\n\ndeclare module 'mahameru' {\n\texport interface DataSources {\n\t\t${lines.join('\n')}\n\t}\n\n\texport interface PreInitContext {\n\t\tdataSources: DataSources;\n\t}\n}\n`
            : `// Do not edit this file, it is generated by MahameruJS\n\ndeclare module 'mahameru' {}\n`;
        const outputPath = join(this.config.appPath, 'types', 'dataSources.d.ts')

        try {
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, dataSourceTemplate, 'utf-8');

        } catch (error) {
            console.error('Error generating data sources types:', error);
        }
    }

    protected async generateRouteTypes() {
        if (this.isInit)
            return

        const foundPaths: string[] = [];
        const routesPath = join(this.config.appPath, this.config.routesDir);

        async function scan(dir: string, currentRoute = '') {
            if (!existsSync(dir))
                return;

            const files = await readdir(dir);

            for (const file of files) {
                const fullPath = join(dir, file);
                const statRes = await stat(fullPath);

                if (statRes.isDirectory()) {
                    const folderName = file.startsWith('[') && file.endsWith(']')
                        ? `:${file.slice(1, -1)}`
                        : file;

                    await scan(fullPath, `${currentRoute}/${folderName}`);
                } else if (file === 'route.js') {
                    foundPaths.push(currentRoute === '' ? '/' : currentRoute);
                }
            }
        }

        await scan(routesPath);

        const routeUnion = foundPaths.map(p => `'${p}'`).join(' | ') || 'string';
        const template = `// Do not edit this file, it is generated by MahameruJS\n\nimport { RouteObject } from 'mahameru';\n\ntype MahameruGeneratedRoutes = ${routeUnion};\n\ndeclare module 'mahameru' {\n\texport interface RegisterRoutes {\n\t\troutes: MahameruGeneratedRoutes | RouteObject<MahameruGeneratedRoutes>;\n\t}\n}\n`;
        const outputPath = join(process.cwd(), '.mahameru/types/routes.d.ts');

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, template.trim(), 'utf-8');
    }

    protected async generateMahameruDTSFile(typeIndexFile: string) {
        if (!existsSync(typeIndexFile))
            return;

        const toRelative = (path: string) => path.replace(process.cwd(), '.').replace(/\\/g, '/');
        const dTSContents = `/// <reference path="${toRelative(typeIndexFile)}" />

// Do not edit this file, it is generated by MahameruJS
`

        const dTSfile = join(process.cwd(), 'mahameru.d.ts');
        await writeFile(dTSfile, dTSContents, 'utf-8');
    }

    protected async generateBarrelIndexFile(targetDir: string) {
        try {
            const items = await readdir(targetDir);

            const exportLinesPromises = items.map(async (item) => {
                if (item === 'index.d.ts' || item === 'index.ts' || item === 'index.js') return null;

                const fullPath = join(targetDir, item);
                const stats = await stat(fullPath);
                const isDirectory = stats.isDirectory();

                if (isDirectory || item.endsWith('.ts') || item.endsWith('.js')) {
                    const nameWithoutExt = parse(item).name;
                    return `export * from './${nameWithoutExt}'`;
                }

                return null;
            });

            const exportLines = (await Promise.all(exportLinesPromises))
                .filter((line): line is string => line !== null);

            if (exportLines.length === 0)
                return

            const fileContent = exportLines.join('\n') + '\n';

            const outputPath = join(targetDir, 'index.d.ts');
            await writeFile(outputPath, fileContent, 'utf-8');

            await this.generateMahameruDTSFile(outputPath)
        } catch (error) {
            console.error(`Failed to create index.d.ts:`, error);
        }
    }

    protected async loadConfig() {
        const configFilePath = join(this.config.appPath, 'mahameru.config.js');

        if (!existsSync(configFilePath))
            return {}

        const module = this.loadModule(configFilePath);
        const configFunction = this.unwrapDefaultExport<Config>(module);

        if (typeof configFunction !== 'function')
            return {}

        const config = await configFunction(this.parseExtendedConfigToConfig(this.config));

        this.config = { ...this.config, ...config };
    }

    protected parseExtendedConfigToConfig(config: Partial<MahameruExtendedConfig>): MahameruConfig {
        return {
            host: config.host || this.config.host,
            port: config.port || this.config.port,
            name: config.name || this.config.name,
            trailingSlash: config.trailingSlash || this.config.trailingSlash,
            allowedOrigins: config.allowedOrigins || this.config.allowedOrigins,
            disableHttpSignatureResponse: config.disableHttpSignatureResponse || this.config.disableHttpSignatureResponse
        }
    }

    protected loadEnvironmentVariables() {
        const defaultEnvFilePath = join(this.config.rootPath, '.env');
        const MAHAMERU__MODE = process.env.MAHAMERU__MODE === "development" ? "development" : "production";
        const envFilePath = join(this.config.rootPath, `.env.${MAHAMERU__MODE}`);

        if (existsSync(defaultEnvFilePath)) {
            process.loadEnvFile(defaultEnvFilePath)
        }

        if (existsSync(envFilePath)) {
            process.loadEnvFile(envFilePath)
        }
    }

    protected async loadDatabases() {
        await this.destroyDatabases();

        const dataSourcePath = join(this.config.appPath, 'databases');

        if (!existsSync(dataSourcePath))
            return;

        const databaseDirs = await readdir(dataSourcePath, { withFileTypes: true });

        for (const databaseDir of databaseDirs) {
            const fullPath = join(dataSourcePath, databaseDir.name);

            if (!databaseDir.isDirectory())
                continue;

            const items = await readdir(fullPath, { withFileTypes: true });

            for (const item of items) {
                const filePath = join(fullPath, item.name);

                if (!item.isFile() && item.name !== 'index.js')
                    continue

                const module = this.loadModule(filePath);
                const dataSource = this.unwrapDefaultExport<TypeOrmDataSource>(module);

                if (!("options" in dataSource))
                    continue;

                await dataSource.initialize();

                console.log(`Database ${databaseDir.name} initialized.`);

                this.dataSources[databaseDir.name] = dataSource;
            }
        }

        await this.generateDataSourcesTypes()
    }

    protected async destroyDatabases() {
        if (Object.keys(this.dataSources).length <= 0)
            return;

        for (const databaseName in this.dataSources) {
            if (!this.dataSources.hasOwnProperty(databaseName))
                continue;

            const dataSource = this.dataSources[databaseName];

            if (dataSource.isInitialized) {
                await dataSource.destroy();

                console.log(`Database ${databaseName} destroyed.`);
            }

            delete this.dataSources[databaseName];
        }
    }

    protected async loadPreInitHandler(appPath: string) {
        const preInitPath = join(appPath, 'pre-init.js');

        if (!existsSync(preInitPath)) {
            this.preInitHandler = undefined;

            return;
        }

        const module = this.loadModule(preInitPath);
        const preInitHandler = this.unwrapDefaultExport<PreInitHandler>(module);

        if (typeof preInitHandler !== 'function')
            return

        this.preInitHandler = preInitHandler;
    }

    protected async loadMiddleware(appPath: string) {
        const middlewarePath = join(appPath, 'middleware.js');

        if (!existsSync(middlewarePath)) {
            this.middleware = undefined;
            return;
        }

        const middlewareModule = this.loadModule(middlewarePath, this.developmentMode);
        const middleware = this.unwrapDefaultExport<MahameruMiddleware>(middlewareModule);

        if (typeof middleware !== 'function') {
            throw new MahameruError(
                `Global middleware at '${middlewarePath}' must export a default function.`
            );
        }

        if (middlewareModule && middlewareModule.protectedRoutes) {
            this.protectedRoutes = middlewareModule.protectedRoutes
        }

        this.middleware = middleware as MahameruMiddleware;
    }

    protected async loadErrorHandler(appPath: string) {
        const errorHandlerPath = join(appPath, 'error.js');

        if (!existsSync(errorHandlerPath)) {
            this.errorHandler = undefined;

            return;
        }

        const errorHandlerModule = this.loadModule(errorHandlerPath, this.developmentMode);
        const errorHandler = this.unwrapDefaultExport(errorHandlerModule);

        if (typeof errorHandler !== 'function') {
            throw new MahameruHttpServerError(
                `Error handler at '${errorHandlerPath}' must export a default function.`
            );
        }

        this.errorHandler = errorHandler as MahameruErrorHandler;
    }

    protected async loadNotFoundHandler(appPath: string) {
        const notFoundHandlerPath = join(appPath, 'routes', 'not-found.js');

        if (!existsSync(notFoundHandlerPath)) {
            this.notFoundHandler = undefined;
            return;
        }

        const notFoundHandlerModule = this.loadModule(notFoundHandlerPath, this.developmentMode);
        const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
        const hasValidHandler = supportedMethods.some((supportedMethod) =>
            typeof notFoundHandlerModule[supportedMethod] === 'function'
        );

        if (!hasValidHandler) {
            throw new MahameruHttpServerError(
                `Not found handler at '${notFoundHandlerPath}' must export at least one HTTP method handler.`
            );
        }

        this.notFoundHandler = notFoundHandlerModule as RouteHandlerModule;
    }

    protected async runMiddlewarePipeline(
        middleware: MahameruMiddleware,
        context: MahameruMiddlewareContext,
        handler: () => Promise<MahameruResponse> | MahameruResponse
    ) {
        const isProtectedRoute = validateProtectedRoute(this.protectedRoutes, context.method, context.path);
        const response = await middleware(context, isProtectedRoute, async () => {
            const nextResponse = await handler();
            return this.normalizeMahameruResponse(
                nextResponse,
                'Route handlers and next() must resolve to MahameruResponse.'
            );
        });

        return this.normalizeMahameruResponse(
            response,
            'Global middleware must return a MahameruResponse instance.'
        );
    }

    protected async runErrorHandler(
        error: unknown,
        context: MahameruMiddlewareContext
    ): Promise<MahameruResponse> {
        const fallbackResponse = this.createInternalServerErrorResponse(error);

        if (!this.errorHandler) {
            console.error(error instanceof MahameruHttpServerError ? error.details ?? error : error);

            return fallbackResponse;
        }

        try {
            const handlerResponse = await this.errorHandler(
                {
                    ...context,
                    error
                },
                async () => fallbackResponse
            );

            return this.normalizeMahameruResponse(
                handlerResponse,
                'Error handler must return a MahameruResponse instance.'
            );
        } catch (handlerError) {
            console.error(handlerError);
            return fallbackResponse;
        }
    }

    protected async runNotFoundHandler(
        request: MahameruRequest,
        method: string,
        path: string
    ): Promise<MahameruResponse | undefined> {
        if (!this.notFoundHandler) {
            return undefined;
        }

        const handler = this.notFoundHandler[method];

        if (typeof handler !== 'function') {
            return undefined;
        }

        const response = await handler(request, this.container, { params: {} });

        return this.normalizeMahameruResponse(
            response,
            `Not found handler for method '${method}' must return a MahameruResponse instance.`
        );
    }

    protected isMahameruResponseLike(value: unknown): value is MahameruResponseLike {
        if (!value || typeof value !== 'object') {
            return false;
        }

        if (!('status' in value) || typeof value.status !== 'number') {
            return false;
        }

        if (!('body' in value)) {
            return false;
        }

        if (!('headers' in value) || value.headers === undefined) {
            return true;
        }

        if (value.headers instanceof Headers) {
            return true;
        }

        return typeof value.headers === 'object' && value.headers !== null && !Array.isArray(value.headers);
    }

    protected normalizeMahameruResponse(value: unknown, errorMessage: string): MahameruResponse {
        if (value instanceof MahameruResponse) {
            return value;
        }

        if (!this.isMahameruResponseLike(value)) {
            throw new MahameruHttpServerError(errorMessage);
        }

        const normalizedHeaders = value.headers instanceof Headers
            ? Object.fromEntries(value.headers.entries())
            : value.headers;

        return new MahameruResponse(value.body, {
            status: value.status,
            headers: normalizedHeaders
        });
    }

    protected createInternalServerErrorResponse(error: unknown): MahameruResponse {
        const serverError = error instanceof MahameruHttpServerError
            ? error
            : new MahameruHttpServerError(error instanceof Error ? error.message : undefined);

        return MahameruResponse.json(
            { error: serverError.message },
            { status: serverError.statusCode }
        );
    }

    protected normalizePathForMatching(path: string): string {
        if (path.length > 1 && path.endsWith('/')) {
            return path.slice(0, -1);
        }

        return path;
    }

    protected sendResponse(response: DefaultHTTPResponse, responseHeader: Headers, mahameruResponse: MahameruResponse) {
        const finalHeaders = new Headers();

        responseHeader.forEach((value, key) => {
            finalHeaders.append(key, value);
        });

        if (mahameruResponse.headers instanceof Headers) {
            mahameruResponse.headers.forEach((value, key) => {
                finalHeaders.set(key, value);
            });
        } else if (mahameruResponse.headers) {
            for (const [key, value] of Object.entries(mahameruResponse.headers)) {
                finalHeaders.set(key, value as string);
            }
        }

        response.setHeaders(finalHeaders);
        response.writeHead(mahameruResponse.status);
        response.end(JSON.stringify(mahameruResponse.body));

        this.requestLogger(response);
    }

    protected findMatchedRoute(matchUrl: string) {
        let matchedRoute: RouteItem | null = null;
        let matchResult: RegExpExecArray | null = null;

        for (const route of this.routeRegistry) {
            const result = route.regex.exec(matchUrl);

            if (result) {
                matchedRoute = route;
                matchResult = result;
                break;
            }
        }

        return { matchedRoute, matchResult };
    }

    protected loadDevRouteHandler(routeFilePath: string, method: string) {
        if (runtimeRequire.cache[routeFilePath]) {
            delete runtimeRequire.cache[routeFilePath];
        }

        const freshHandlers = runtimeRequire(routeFilePath);

        return freshHandlers[method];
    }

    protected async reloadRuntimeState() {
        this.loadEnvironmentVariables();
        await this.resetRuntimeState();

        await this.loadDatabases();
        await this.loadPreInitHandler(this.config.appPath);

        if (typeof this.preInitHandler !== 'undefined')
            await this.preInitHandler({ container: {}, ...(Object.keys(this.dataSources).length > 0 ? { dataSources: this.dataSources } : {}) })

        await this.loadConfig();

        await this.container.discover();
        await this.scanRoutes(join(this.config.appPath, this.config.routesDir));
        await this.generateBarrelIndexFile(join(this.config.rootPath, this.config.developmentDir, 'types'));
        await this.loadMiddleware(this.config.appPath);
        await this.loadErrorHandler(this.config.appPath);
        await this.loadNotFoundHandler(this.config.appPath);
    }

    protected async resetRuntimeState() {
        this.routeRegistry = [];
        this.preInitHandler = undefined;
        this.middleware = undefined;
        this.errorHandler = undefined;
        this.notFoundHandler = undefined;
        this.container = new MahameruContainer({
            modulesDir: join(this.config.appPath, this.config.modulesDir),
            dataSources: this.dataSources
        });
    }

    protected clearRuntimeRequireCache(targetFile?: string) {
        const runtimeRoot = resolve(this.config.appPath);

        for (const cacheKey of Object.keys(runtimeRequire.cache)) {
            if (cacheKey.startsWith(runtimeRoot)) {
                delete runtimeRequire.cache[cacheKey];
            }
        }

        if (!targetFile) {
            return;
        }

        const resolvedTarget = resolve(targetFile);

        if (runtimeRequire.cache[resolvedTarget]) {
            delete runtimeRequire.cache[resolvedTarget];
        }
    }

    protected loadModule(filePath: string, fresh = false) {
        const resolvedPath = resolve(filePath);

        if (fresh && runtimeRequire.cache[resolvedPath]) {
            delete runtimeRequire.cache[resolvedPath];
        }

        return runtimeRequire(resolvedPath);
    }

    protected unwrapDefaultExport<T>(module: Record<string, unknown>): T {
        if ('default' in module && typeof module.default === 'object' && module.default !== null && 'default' in (module.default as Record<string, unknown>)) {
            return (module.default as Record<string, T>).default;
        }

        if ('default' in module) {
            return module.default as T;
        }

        return module as T;
    }

    protected requestLogger(response: DefaultHTTPResponse) {
        if (!this.developmentMode)
            return

        console.log(`${response.req.method} ${response.statusCode} ${response.req.url}`);
    }

    protected log(...data: any[]) {
        if (!this.developmentMode)
            return

        console.log(...data);
    }
}

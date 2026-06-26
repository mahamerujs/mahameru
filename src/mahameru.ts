import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { toKebabCase } from 'porterman/string-helper'
import pc from 'picocolors';

import { MahameruHttpServerError } from './mahameru-http-server-error';
import { MahameruContainer } from './mahameru-container';
import { MahameruRequest } from './mahameru-request';
import { MahameruResponse } from './mahameru-response';
import { MahameruError } from './mahameru-error';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';

import type { MahameruIPCMessageChild, MahameruIPCMessageServer } from './types/mahameru-ipc-message'
import { validateProtectedRoute } from './helpers';

const runtimeRequire = createRequire(__filename);

export interface MahameruBaseConfig {
    rootPath: string;
    appPath: string;
    productionDir: string;
    productionConfigFile: string;
    developmentDir: string;
    httpServerSignature: string;
    mahameruConfigFile: string;
}

export interface MahameruConfig {
    /**
     * Application name.
     * Name cannot contain spaces.
     * @type {string}
     * @default 'MahameruJS'
     * @example 'mahamerujs'
     */
    name: string;
    /**
     * Enable or disable the development mode.
     * @type {boolean}
     * @default false
     */
    dev: boolean;
    /**
     * Server port.
     * @type {number}
     * @default 3000
     */
    port: number;
    /**
     * Server host.
     * @type {string}
     * @default 'localhost'
     */
    host: string;
    /**
     * Enable or disable the trailing slash.
     * @type {boolean}
     * @default false
     */
    trailingSlash: boolean;
    /**
     * Allowed origins for CORS. Set to `undefined` to disable CORS.
     * @type {string[] | undefined}
     * @default undefined
     */
    allowedOrigins?: string[];
    /**
     * Disable the HTTP signature response header.
     * X-Powered-By: MahameruJS
     * @type {boolean}
     * @default false
     */
    disableHttpSignatureResponse?: boolean;
    /**
     * Relative path to the modules directory.
     * @type {string}
     * @default modules
     */
    modulesDir: string;
    /**
     * Relative path to the routes directory.
     * @type {string}
     * @default routes
     */
    routesDir: string;
}

export type MahameruExtendedConfig = MahameruBaseConfig & MahameruConfig;

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

export type MahameruConfigFunction = (defaultConfig: MahameruConfig) => Promise<Partial<MahameruConfig>>;

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type ProtectedRoute<T> = (
    | T
    | {
        path: T;
        methods: HTTPMethod[];
    }
)[];

export const mahameruDefaultBaseConfig: MahameruBaseConfig = {
    rootPath: process.cwd(),
    get appPath(): string {
        return join(this.rootPath, this.developmentDir)
    },
    productionDir: '.mahameru',
    productionConfigFile: '.mahameru.config.json',
    developmentDir: '.mahameru',
    httpServerSignature: 'MahameruJS',
    mahameruConfigFile: 'mahameru.config.ts'
}

export const mahameruDefaultConfig: MahameruConfig = {
    name: toKebabCase('MahameruJS'),
    dev: process.env.MAHAMERU__MODE === 'development',
    port: process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT) : 3000,
    host: process.env.MAHAMERU__HTTP_LISTEN_HOST || 'localhost',
    allowedOrigins: undefined,
    trailingSlash: false,
    modulesDir: 'modules',
    routesDir: 'routes',
    disableHttpSignatureResponse: false
};

type DefaultHTTPResponse = ServerResponse<IncomingMessage> & {
    req: IncomingMessage;
}

export class Mahameru {
    protected _initialized = false;
    protected options: MahameruExtendedConfig;
    protected routeRegistry: RouteItem[] = [];
    protected protectedRoutes: ProtectedRoute<any>[] = [];
    protected middleware?: MahameruMiddleware;
    protected errorHandler?: MahameruErrorHandler;
    protected notFoundHandler?: RouteHandlerModule;
    protected container: MahameruContainer;
    protected httpServer: HttpServer | null = null;
    protected isShuttingDown = false;
    protected handleOnHttpClose?: () => void;

    constructor(
        options?: Partial<MahameruConfig>
    ) {
        this.options = this.buildConfig(options);
        this.container = new MahameruContainer({
            modulesDir: join(this.options.appPath, this.options.modulesDir)
        });
    }

    /**
     * Indicates whether the Mahameru server has been initialized or not.
     */
    get initialized() {
        return this._initialized;
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
                .listen(this.options.port, this.options.host)
                .on('listening', () => {
                    this._initialized = true;

                    this.setupIpcListener();

                    if (process.send)
                        process.send({ type: 'READY', data: { mode: this.options.dev ? 'development' : 'production', host: this.options.host, port: this.options.port } } as MahameruIPCMessageServer);

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
        if (!this.options.dev || !this._initialized)
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

        console.log(`Graceful Shutting down... ${pc.green('Done')}`);
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

    reconfigure(options?: Partial<MahameruConfig>) {
        this.options = this.buildConfig(options);
        this.resetRuntimeState();
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
                const origin = request.headers.origin;
                responseHeader.append('Content-Type', 'application/json');

                if (!this.options.disableHttpSignatureResponse) {
                    responseHeader.append('X-Powered-By', this.options.httpServerSignature);
                }

                response.setHeaders(responseHeader);

                if (origin && this.options.allowedOrigins && !this.options.allowedOrigins.includes(origin)) {
                    response.writeHead(403);
                    return response.end(JSON.stringify({ error: 'Forbidden' }));
                }

                if (this.options.trailingSlash === false && rawReqUrl.length > 1 && rawReqUrl.endsWith('/')) {
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

                if (this.options.dev) {
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

            case 'GENERATE_ROUTE_TYPES':
                await this.generateRouteTypes();

                break;

            case 'RELOAD':
                this.log('Reloading runtime state...');

                await this.reloadRuntimeState();

                this.log(`Reloading runtime state... ${pc.green('Done')}`);

                break;

            case 'RESTART':
                this.log('Restarting server...');

                await this.close();
                await this.initialize();

                this.log(`Restarting server... ${pc.green('Done')}`);

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

        const items = readdirSync(currentDir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(currentDir, item.name);

            if (item.isDirectory()) {
                await this.scanRoutes(baseDir, fullPath);

                continue;
            }

            const isRouteFile = this.options.dev
                ? (item.name === 'route.js')
                : (item.name === 'route.ts' || item.name === 'route.js');

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

                if (!this.options.dev) {
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

    protected async generateRouteTypes() {
        const foundPaths: string[] = [];
        const routesPath = join(this.options.appPath, this.options.routesDir);

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
                } else if (file === 'route.ts' || file === 'route.js') {
                    foundPaths.push(currentRoute === '' ? '/' : currentRoute);
                }
            }
        }

        await scan(routesPath);

        const routeUnion = foundPaths.map(p => `'${p}'`).join(' | ') || 'string';
        const template = `// Do not edit this file, it is generated by MahameruJS

type MahameruGeneratedRoutes = ${routeUnion};
`;

        const dTSContents = `/// <reference path="./.mahameru/types/routes.d.ts" />

// Do not edit this file, it is generated by MahameruJS
`

        const dTSfile = join(process.cwd(), 'mahameru.d.ts');
        const outputPath = join(process.cwd(), '.mahameru/types/routes.d.ts');

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, template.trim());
        await writeFile(dTSfile, dTSContents);
    }

    protected loadEnvironmentVariables() {
        const defaultEnvFilePath = join(this.options.rootPath, '.env');
        const MAHAMERU__MODE = process.env.MAHAMERU__MODE === "development" ? "development" : "production";
        const envFilePath = join(this.options.rootPath, `.env.${MAHAMERU__MODE}`);

        if (existsSync(defaultEnvFilePath)) {
            process.loadEnvFile(defaultEnvFilePath)
        }

        if (existsSync(envFilePath)) {
            process.loadEnvFile(envFilePath)
        }
    }

    protected async loadUserConfig(configPath: string) {
        if (!existsSync(configPath))
            return;

        let userConfig: Partial<MahameruConfig>

        if (this.options.dev) {
            const configModule = this.loadModule(configPath, this.options.dev);
            const userConfigFunction = this.unwrapDefaultExport(configModule) as MahameruConfigFunction;

            if (typeof userConfigFunction !== 'function')
                return

            userConfig = await userConfigFunction(mahameruDefaultConfig);
        } else {
            try {
                const rawConfigJSON = await readFile(configPath, 'utf-8');
                userConfig = JSON.parse(rawConfigJSON);
            } catch (error) {
                console.error(pc.red(`Error loading config file: ${configPath}`));
                console.error(pc.yellow(`${configPath} is not a valid JSON file.`));

                if (this.initialized) {
                    await this.close();
                }

                return
            }
        }

        this.options = this.buildConfig(userConfig);
    }

    protected async loadMiddleware(appPath: string) {
        const middlewarePaths = [
            join(appPath, 'middleware.ts'),
            join(appPath, 'middleware.js')
        ];

        const middlewarePath = middlewarePaths.find(existsSync);

        if (!middlewarePath) {
            this.middleware = undefined;
            return;
        }

        const middlewareModule = this.loadModule(middlewarePath, this.options.dev);

        if (middlewareModule && middlewareModule.protectedRoutes) {
            this.protectedRoutes = middlewareModule.protectedRoutes
        }

        const middleware = this.unwrapDefaultExport(middlewareModule);

        if (typeof middleware !== 'function') {
            throw new MahameruError(
                `Global middleware at '${middlewarePath}' must export a default function.`
            );
        }

        this.middleware = middleware as MahameruMiddleware;
    }

    protected async loadErrorHandler(appPath: string) {
        const errorHandlerPaths = [
            join(appPath, 'error.ts'),
            join(appPath, 'error.js')
        ];

        const errorHandlerPath = errorHandlerPaths.find(existsSync);

        if (!errorHandlerPath) {
            this.errorHandler = undefined;

            return;
        }

        const errorHandlerModule = this.loadModule(errorHandlerPath, this.options.dev);
        const errorHandler = this.unwrapDefaultExport(errorHandlerModule);

        if (typeof errorHandler !== 'function') {
            throw new MahameruHttpServerError(
                `Error handler at '${errorHandlerPath}' must export a default function.`
            );
        }

        this.errorHandler = errorHandler as MahameruErrorHandler;
    }

    protected async loadNotFoundHandler(appPath: string) {
        const notFoundHandlerPaths = [
            join(appPath, 'routes', 'not-found.ts'),
            join(appPath, 'routes', 'not-found.js')
        ];

        const notFoundHandlerPath = notFoundHandlerPaths.find(existsSync);

        if (!notFoundHandlerPath) {
            this.notFoundHandler = undefined;
            return;
        }

        const notFoundHandlerModule = this.loadModule(notFoundHandlerPath, this.options.dev);
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

    protected buildConfig(options?: Partial<MahameruConfig>): MahameruExtendedConfig {
        const mergedConfig = {
            ...mahameruDefaultConfig,
            ...options
        };

        return {
            ...mahameruDefaultBaseConfig,
            ...mergedConfig,
            appPath: join(
                mahameruDefaultBaseConfig.rootPath,
                mergedConfig.dev
                    ? mahameruDefaultBaseConfig.developmentDir
                    : mahameruDefaultBaseConfig.productionDir
            )
        };
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
        const userConfigFilePath = this.options.dev ? join(this.options.rootPath, this.options.mahameruConfigFile) : join(this.options.rootPath, this.options.productionDir, this.options.productionConfigFile);
        this.loadEnvironmentVariables();
        await this.loadUserConfig(userConfigFilePath);
        this.resetRuntimeState();
        await this.container.discover();
        await this.scanRoutes(join(this.options.appPath, this.options.routesDir));
        await this.loadMiddleware(this.options.appPath);
        await this.loadErrorHandler(this.options.appPath);
        await this.loadNotFoundHandler(this.options.appPath);
    }

    protected resetRuntimeState() {
        this.routeRegistry = [];
        this.middleware = undefined;
        this.errorHandler = undefined;
        this.notFoundHandler = undefined;
        this.container = new MahameruContainer({
            modulesDir: join(this.options.appPath, this.options.modulesDir)
        });
    }

    protected clearRuntimeRequireCache(targetFile?: string) {
        const runtimeRoot = resolve(this.options.appPath);

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
        if (!this.options.dev)
            return

        const parseStatusCodeColor = (statusCode: number) => {
            if (statusCode >= 200 && statusCode < 300) {
                return pc.green(statusCode);
            } else if (statusCode >= 300 && statusCode < 400) {
                return pc.cyan(statusCode);
            } else if (statusCode >= 400 && statusCode < 500) {
                return pc.yellow(statusCode);
            } else {
                return pc.red(statusCode);
            }
        }

        console.log(`${pc.yellow(response.req.method)} ${parseStatusCodeColor(response.statusCode)} ${response.req.url}`);
    }

    protected log(...data: any[]) {
        if (!this.options.dev)
            return

        console.log(...data);
    }
}

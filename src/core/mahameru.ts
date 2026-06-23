import { join, relative, resolve } from 'path';
import { createServer, IncomingMessage } from 'http';
import { MahameruRequest, MahameruResponse } from './index.js';
import { MahameruHttpServerError } from './mahameru-http-server-error.js';
import { MahameruContainer } from './index.js';
import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';

export interface MahameruBaseConfig {
    httpServerSignature: string;
}

export interface MahameruConfig {
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
     * Relative path to the application.
     * @type {string}
     * @default process.cwd()
     */
    appPath: string;
    /**
     * Relative path to the modules directory.
     * @type {string}
     * @default path.join(process.cwd(), 'src', 'modules')
     */
    modulesPath: string;
    /**
     * Relative path to the routes directory.
     * @type {string}
     * @default path.join(process.cwd(), 'src', 'routes')
     */
    routesPath: string;
}

export type MahameruExtendedConfig = MahameruBaseConfig & MahameruConfig;

export interface RouteItem {
    path: string;
    regex: RegExp;
    paramNames: string[];
    handlers: any;
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

export const mahameruDefaultConfig: MahameruConfig = {
    appPath: join(process.cwd(), 'src'),
    trailingSlash: false,
    dev: false,
    port: 3000,
    host: 'localhost',
    allowedOrigins: undefined,
    modulesPath: join(process.cwd(), 'src', 'modules'),
    routesPath: join(process.cwd(), 'src', 'routes'),
    disableHttpSignatureResponse: false
};

export class Mahameru {
    protected options: MahameruExtendedConfig;
    protected routeRegistry: RouteItem[] = [];
    protected middleware?: MahameruMiddleware;
    protected errorHandler?: MahameruErrorHandler;
    protected notFoundHandler?: RouteHandlerModule;

    constructor(
        options: Partial<MahameruConfig> = {},
        protected readonly container: MahameruContainer
    ) {
        this.options = this.buildConfig(options);
    }

    async initialize(): Promise<boolean> {
        await this.container.autoDiscover(this.options.modulesPath);
        await this.scanRoutes(this.options.routesPath);
        await this.loadMiddleware(this.options.appPath);
        await this.loadErrorHandler(this.options.appPath);
        await this.loadNotFoundHandler(this.options.appPath);

        return new Promise((resolve, reject) => {
            this.createHttpServer()
                .listen(this.options.port, this.options.host)
                .on('listening', () => resolve(true))
                .on('error', (error) => {
                    if (error instanceof Error) {
                        reject(new MahameruHttpServerError(error.message));
                        return;
                    }
                    reject(error);
                })
                .on('close', () => {
                    console.log('Mahameru HTTP Server closed.');
                });
        });
    }

    protected createHttpServer = () =>
        createServer(async (request, response) => {
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
                this.requestLogger(request);

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

                let matchedRoute = null;
                let matchResult = null;

                for (const route of this.routeRegistry) {
                    const result = route.regex.exec(matchUrl);

                    if (result) {
                        matchedRoute = route;
                        matchResult = result;

                        break;
                    }
                }

                if (!matchedRoute) {
                    const notFoundResponse = await this.runNotFoundHandler(mahameruRequest, method, matchUrl);

                    return this.sendResponse(response, responseHeader, notFoundResponse ?? MahameruResponse.json(
                        { error: 'Not Found' },
                        { status: 404 }
                    ));
                }

                const handler: RouteHandler = matchedRoute.handlers[method];

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

    protected async scanRoutes(baseDir: string, currentDir: string = baseDir) {
        if (!existsSync(currentDir)) return;

        const items = readdirSync(currentDir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(currentDir, item.name);

            if (item.isDirectory()) {
                await this.scanRoutes(baseDir, fullPath);

                continue;
            }

            if (item.isFile() && (item.name === 'route.ts' || item.name === 'route.js')) {
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
                const fileUrl = pathToFileURL(resolve(fullPath)).href;
                const handlers = await import(/* webpackIgnore: true */ fileUrl);

                this.routeRegistry.push({
                    path: urlPath,
                    regex: routeRegex,
                    paramNames,
                    handlers
                });
            }
        }
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

        const fileUrl = pathToFileURL(resolve(middlewarePath)).href;
        const middlewareModule = await import(/* webpackIgnore: true */ fileUrl);
        const middleware = middlewareModule.default;

        if (typeof middleware !== 'function') {
            throw new MahameruHttpServerError(
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

        const fileUrl = pathToFileURL(resolve(errorHandlerPath)).href;
        const errorHandlerModule = await import(/* webpackIgnore: true */ fileUrl);
        const errorHandler = errorHandlerModule.default;

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

        const fileUrl = pathToFileURL(resolve(notFoundHandlerPath)).href;
        const notFoundHandlerModule = await import(/* webpackIgnore: true */ fileUrl);
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
        const response = await middleware(context, async () => {
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

    protected sendResponse(response: any, responseHeader: Headers, mahameruResponse: MahameruResponse) {
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
    }

    protected buildConfig(options: Partial<MahameruConfig>): MahameruExtendedConfig {
        const mahameruBaseOptions: MahameruBaseConfig = {
            httpServerSignature: 'MahameruJS'
        };

        return {
            ...mahameruDefaultConfig,
            ...options,
            ...mahameruBaseOptions
        };
    }

    protected requestLogger(request: IncomingMessage) {
        if (!this.options.dev)
            return

        console.log(`\x1b[33m${request.method} ${request.url}\x1b[0m`);
    }
}

export default async function mahameru(options: Partial<MahameruConfig>) {
    const container = new MahameruContainer();
    return new Mahameru(options, container);
}

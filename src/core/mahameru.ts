import { join, relative, resolve } from 'path';
import { createServer, IncomingMessage } from 'http';
import { MahameruRequest, MahameruResponse } from './index.js';
import { MahameruHttpServerError } from './mahameru-http-server-error.js';
import { MahameruContainer } from './index.js';
import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';

export interface MahameruBaseConfig {
    rootPath: string;
    appPath: string;
    modulesPath: string;
    routesPath: string;
    httpServerSignature: string;
}

export interface MahameruConfig {
    dev: boolean;
    port: number;
    host: string;
    trailingSlash: boolean;
    allowedOrigins?: string[];
    disableHttpSignatureResponse?: boolean;
}

export type MahameruExtendedConfig = MahameruBaseConfig & MahameruConfig;

export interface RouteItem {
    path: string;
    regex: RegExp;
    paramNames: string[];
    handlers: any;
}

export type RouteHandler = (
    request: MahameruRequest,
    container: MahameruContainer,
    context: { params: Record<string, string> }
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

export const mahameruDefaultConfig: MahameruConfig = {
    trailingSlash: false,
    dev: false,
    port: 3000,
    host: 'localhost',
    allowedOrigins: undefined
};

export class Mahameru {
    protected options: MahameruExtendedConfig;
    protected routeRegistry: RouteItem[] = [];
    protected middleware?: MahameruMiddleware;

    constructor(
        options: Partial<MahameruConfig> = {},
        protected readonly container: MahameruContainer
    ) {
        this.options = this.buildConfig(options);
    }

    async initialize(): Promise<boolean> {
        const appPath = this.options.appPath;

        await this.container.autoDiscover(join(appPath, 'modules'));
        await this.scanRoutes(join(appPath, 'routes'));
        await this.loadMiddleware(appPath);

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
            try {
                this.requestLogger(request);

                let reqUrl = request.url?.split('?')[0] || '/';
                const method = request.method || 'GET';
                const origin = request.headers.origin;

                const responseHeader = new Headers();
                responseHeader.append('Content-Type', 'application/json');

                if (!this.options.disableHttpSignatureResponse) {
                    responseHeader.append('X-Powered-By', this.options.httpServerSignature);
                }

                response.setHeaders(responseHeader);

                if (origin && this.options.allowedOrigins && !this.options.allowedOrigins.includes(origin)) {
                    response.writeHead(403);
                    return response.end(JSON.stringify({ error: 'Forbidden' }));
                }

                if (this.options.trailingSlash === false && reqUrl.length > 1 && reqUrl.endsWith('/')) {
                    const cleanUrl = reqUrl.slice(0, -1);
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
                    const result = route.regex.exec(reqUrl);

                    if (result) {
                        matchedRoute = route;
                        matchResult = result;

                        break;
                    }
                }

                if (!matchedRoute) {
                    response.writeHead(404);

                    return response.end(JSON.stringify({ error: 'Not Found' }));
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

                const mahameruRequest = new MahameruRequest(request);
                const mahameruResponse: MahameruResponse = this.middleware
                    ? await this.runMiddlewarePipeline(
                        this.middleware,
                        {
                            request: mahameruRequest,
                            container: this.container,
                            params,
                            path: reqUrl,
                            method
                        },
                        () => handler(mahameruRequest, this.container, { params })
                    )
                    : await handler(
                        mahameruRequest,
                        this.container,
                        { params }
                    );

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
            } catch (error: any) {
                console.error(error);
                response.writeHead(500, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
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

    protected async runMiddlewarePipeline(
        middleware: MahameruMiddleware,
        context: MahameruMiddlewareContext,
        handler: () => Promise<MahameruResponse> | MahameruResponse
    ) {
        const response = await middleware(context, async () => {
            const nextResponse = await handler();

            if (!(nextResponse instanceof MahameruResponse)) {
                throw new MahameruHttpServerError(
                    'Route handlers and next() must resolve to MahameruResponse.'
                );
            }

            return nextResponse;
        });

        if (!(response instanceof MahameruResponse)) {
            throw new MahameruHttpServerError(
                'Global middleware must return a MahameruResponse instance.'
            );
        }

        return response;
    }

    protected buildConfig(options: Partial<MahameruConfig>): MahameruExtendedConfig {
        const rootPath = process.cwd();
        const appPath = join(rootPath, 'src');

        const mahameruBaseOptions: MahameruBaseConfig = {
            httpServerSignature: 'MahameruJS',
            rootPath,
            appPath,
            modulesPath: join(appPath, 'modules'),
            routesPath: join(appPath, 'routes'),
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

import { join, relative, resolve } from 'path';
import { createServer, IncomingMessage } from 'http';
import { MahameruRequest, type MahameruResponse } from './index.js';
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

                const mahameruResponse: MahameruResponse = await handler(
                    new MahameruRequest(request),
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

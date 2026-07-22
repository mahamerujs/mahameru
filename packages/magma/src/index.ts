import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, globSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';

import { createLogger, MahameruPlugin, Generator } from '@mahameru/diatrema';

import { MagmaResponse } from './magma-response';
import { MagmaRequest } from './magma-request';
import { MagmaError } from './magma-error';
import { MagmaErrorResponse } from './magma-error-response';

import { Route } from './route';
import { Container } from './container';
import type { HTTPMethod, MagmaMiddleware, MagmaContext, MagmaNext, RequestParams } from './types';

type DefaultHTTPResponse = ServerResponse<IncomingMessage> & {
  req: IncomingMessage;
  id?: number;
};

type HTTPServerInstance = Server<typeof IncomingMessage, typeof ServerResponse>;

interface MagmaResponseLike {
  body: unknown;
  status: number;
  headers?: Headers | Record<string, string>;
}

export type MagmaOptions = {
  /**
   * Server port.
   * @type {number}
   * @default 3000
   */
  port: number;
  /**
   * Server host.
   * @type {string}
   * @default '127.0.0.1'
   */
  host: string;
  /**
   * Enable or disable debug mode.
   * @type {boolean}
   * @default false
   */
  debug: boolean;
  /**
   * Enable or disable development mode.
   * @type {boolean}
   * @default false
   */
  dev: boolean;
  /**
   * HTTP keep-alive timeout. How long to wait before closing an idle connection in milliseconds.
   * @type {number}
   * @default 5000
   */
  keepAliveTimeout: number;
  /**
   * Disable the HTTP signature response header.
   * X-Powered-By: MahameruJS
   * @type {boolean}
   * @default false
   */
  disableHttpSignature: boolean;
  /**
   * Allowed origins for CORS. Set to `undefined` to disable CORS.
   * @type {string[] | undefined}
   * @default undefined
   */
  allowedOrigins?: string[];
  /**
   * Allowed IPs in request that does not have origin header. Set to `undefined` to disable IP restriction.
   * @type {string[] | undefined}
   * @default undefined
   */
  allowedIps?: string[];
  /**
   * Allowed hosts to connect to MahameruJS
   * @type {string[] | '*'}
   * @default '*'
   * @example
   * allowedHosts: ['localhost', '127.0.0.1']
   */
  allowedHosts?: string[];
  /**
   * Enable or disable the trailing slash.
   * @type {boolean}
   * @default false
   */
  trailingSlash: boolean;
};

const defaultOptions: MagmaOptions = {
  host: '127.0.0.1',
  port: 3000,
  debug: false,
  dev: false,
  keepAliveTimeout: 5000,
  disableHttpSignature: false,
  allowedOrigins: undefined,
  allowedIps: undefined,
  allowedHosts: undefined,
  trailingSlash: false,
};

export default class Magma extends MahameruPlugin<MagmaOptions> {
  public readonly name: string = 'Magma';
  public readonly slugName: string = 'magma';
  protected httpServer: HTTPServerInstance;
  protected container: Container;
  protected route: Route;
  protected _favicon?: Buffer<ArrayBuffer>;
  protected request: Map<number, number> = new Map();

  constructor(options: Partial<MagmaOptions>) {
    super({ ...defaultOptions, ...options });

    this.logger = createLogger('Magma', this._options.debug);

    const appDirPath = join(process.cwd(), '.mahameru');

    this.container = new Container({
      debug: this._options.debug,
      appDirPath,
      dev: this._options.dev,
      moduleType: 'esm',
      modulesDirPath: join(appDirPath, 'modules'),
      routesDirPath: join(appDirPath, 'routes'),
    });
    this.route = new Route(
      {
        debug: this._options.debug,
      },
      {
        container: this.container,
      },
    );
    this._generator = new MagmaGenerator({ debug: this._options.debug });
    this.loadFavicon();
    this.httpServer = this.create();
    this.httpServer.on('error', (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
        const err = error as Record<string, unknown>;

        throw new MagmaError(`Port ${err.port} is already in use`, {
          code: String(err.code),
          address: err.address as string,
          port: err.port as number,
        });
      }

      throw error;
    });
  }

  protected async _onDevHRM(filePath: string): Promise<void> {
    await this.container.onDevHRM(filePath);
  }
  protected async boot() {
    await this.container.discover();

    return new Promise<void>((resolve) => {
      if (this._initialized) {
        resolve();

        return;
      }

      this.httpServer.listen(this._options.port, this._options.host, () => {
        this._initialized = true;

        this.logger.debug('Listening on', `http://${this._options.host}:${this._options.port}`);

        resolve();
      });
    });
  }

  protected terminate(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._initialized || !this.httpServer.listening) {
        resolve();

        return;
      }

      this._isShuttingDown = true;

      this.httpServer.close((error) => {
        if (error) {
          reject(error);

          return;
        }

        this._initialized = false;

        resolve();
      });
    });
  }

  protected create(): HTTPServerInstance {
    const httpServer = createServer(
      async (request, response) => await this.handleRequest(request, response),
    );

    httpServer.keepAliveTimeout = this._options.keepAliveTimeout;
    httpServer.headersTimeout = httpServer.keepAliveTimeout + 1000;

    return httpServer;
  }

  protected async handleRequest(request: IncomingMessage, response: DefaultHTTPResponse) {
    const startTime = Date.now();
    const requestID = this.request.size + 1;
    this.request.set(requestID, startTime);
    response.id = requestID;
    const magmaRequest = new MagmaRequest(request);
    const rawReqPath = magmaRequest.url.split('?')[0] || '/';
    const rawReqUrl = rawReqPath.replace(/\/+/g, '/');
    const method = magmaRequest.method;

    try {
      if (this._isShuttingDown) response.setHeader('Connection', 'close');

      if (typeof this._options.allowedIps !== 'undefined' && magmaRequest.ipAddress) {
        if (!this._options.allowedIps.includes(magmaRequest.ipAddress))
          return this.sendResponse(
            response,
            new MagmaResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
          );
      }

      if (
        typeof this._options.allowedHosts !== 'undefined' &&
        Array.isArray(this._options.allowedHosts)
      )
        if (!this._options.allowedHosts.includes(magmaRequest.headers.host as string))
          return this.sendResponse(
            response,
            new MagmaResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
          );

      if (
        magmaRequest.headers.origin &&
        this._options.allowedOrigins &&
        !this._options.allowedOrigins.includes(magmaRequest.headers.origin)
      )
        return this.sendResponse(
          response,
          new MagmaResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
        );

      if (magmaRequest.method === 'OPTIONS' && this._options.allowedOrigins) {
        this.handleCorsPreflight(request, response);

        return;
      }

      this.applyCorsHeaders(request, response);

      if (
        this._options.trailingSlash === false &&
        rawReqUrl.length > 1 &&
        rawReqUrl.endsWith('/')
      ) {
        const safeUrl = rawReqUrl.slice(0, -1);

        this.sendResponse(
          response,
          new MagmaResponse(JSON.stringify({ message: 'Redirecting to non-trailing slash URL' }), {
            status: 301,
            headers: {
              Location:
                safeUrl + (request.url?.includes('?') ? '?' + request.url.split('?')[1] : ''),
            },
          }),
        );

        return;
      } else if (
        this._options.trailingSlash === true &&
        !rawReqUrl.endsWith('/') &&
        !rawReqUrl.includes('.')
      ) {
        this.sendResponse(
          response,
          new MagmaResponse(JSON.stringify({ message: 'Redirecting to non-trailing slash URL' }), {
            status: 301,
            headers: {
              Location:
                rawReqUrl +
                '/' +
                (request.url?.includes('?') ? '?' + request.url.split('?')[1] : ''),
            },
          }),
        );

        return;
      }

      if (magmaRequest.url === '/favicon.ico')
        return await this.handleFaviconRequest(magmaRequest, response);

      if (rawReqPath !== rawReqUrl) {
        const queryStr = magmaRequest.url?.includes('?')
          ? '?' + magmaRequest.url.split('?')[1]
          : '';
        const redirectPath = rawReqUrl + queryStr;

        return this.sendResponse(
          response,
          new MagmaResponse(JSON.stringify({ message: 'Redirecting to normalized URL' }), {
            status: 301,
            headers: { Location: redirectPath },
          }),
        );
      }

      const { matchedRoute, matchResult, notFoundResponse } =
        await this.route.resolveRoute(magmaRequest);
      const middlewareHandler = this.container.middlewareHandler;

      if (!matchedRoute || !matchResult) {
        const routeHandler: MagmaNext = async () => notFoundResponse;
        const rawResponse = middlewareHandler
          ? await middlewareHandler(
              {
                request: magmaRequest,
                container: this.container.magmaContainer,
                method,
                params: {},
                path: rawReqUrl,
                status: 404,
                isProtectedRoute: false,
              },
              routeHandler,
            )
          : await routeHandler();

        const magmaResponse = this.normalizeMagmaResponse(
          rawResponse,
          'Middleware must return a MagmaResponse instance.',
        );

        return this.sendResponse(response, magmaResponse);
      }

      const handler = matchedRoute.routeHandlers[method];

      if (!handler) {
        response.writeHead(405);

        return response.end(JSON.stringify({ error: `Method ${method} Not Allowed` }));
      }

      const params: RequestParams = {};

      if (matchResult && matchedRoute.paramNames.length > 0)
        matchedRoute.paramNames.forEach((name, index) => {
          params[name] = matchResult[index + 1];
        });

      const context: MagmaContext = {
        container: this.container.magmaContainer,
        request: magmaRequest,
        params,
        path: rawReqUrl,
        method,
        status: 200,
        isProtectedRoute: false,
      };
      const magmaResponse = middlewareHandler
        ? await this.runMiddlewarePipeline(middlewareHandler, context, () => handler(context))
        : await handler(context);

      return this.sendResponse(response, magmaResponse);
    } catch (error: unknown) {
      console.error(error);
      const context: MagmaContext = {
        request: magmaRequest,
        container: this.container.magmaContainer,
        path: rawReqUrl,
        method,
        params: {},
        status: 200,
        isProtectedRoute: false,
      };
      const errorResponse = await this.runErrorHandler(error, context);

      return this.sendResponse(response, errorResponse);
    }
  }

  protected async loadFavicon() {
    let targetFaviconPath: string | undefined = undefined;
    const defaultFaviconPath = join(
      process.cwd(),
      'node_modules',
      '@mahameru/magma',
      'favicon.ico',
    );
    const customFaviconPath = join(process.cwd(), 'favicon.ico');

    if (existsSync(customFaviconPath)) {
      targetFaviconPath = customFaviconPath;
    } else if (defaultFaviconPath) {
      targetFaviconPath = defaultFaviconPath;
    }

    if (!targetFaviconPath) return;

    this._favicon = await readFile(targetFaviconPath);
  }

  protected async handleFaviconRequest(request: MagmaRequest, response: DefaultHTTPResponse) {
    if (!this._favicon) {
      return this.sendResponse(
        response,
        new MagmaResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
      );
    }

    const middlewareHandler = this.container.middlewareHandler;
    const context: MagmaContext = {
      request,
      container: this.container.magmaContainer,
      method: request.method,
      params: {},
      path: request.path,
      status: 200,
      isProtectedRoute: false,
    };

    if (middlewareHandler) {
      const middlewareResponse = await middlewareHandler(
        context,
        async () => new MagmaResponse(this._favicon, { status: 200 }),
      );
      const normalized = this.normalizeMagmaResponse(middlewareResponse, 'Middleware error');
      const headers = new Headers(normalized.headers);

      if (normalized.status === 200) {
        headers.set('Content-Type', 'image/x-icon');

        if (!headers.has('Cache-Control')) {
          headers.set('Cache-Control', 'public, max-age=31536000');
        }
      }

      return this.sendResponse(
        response,
        new MagmaResponse(normalized.body, {
          status: normalized.status,
          headers,
        }),
      );
    }

    const faviconResponse = new MagmaResponse(this._favicon, {
      status: 200,
      headers: {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=31536000',
      },
    });

    return this.sendResponse(response, faviconResponse);
  }

  protected applyCorsHeaders(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;

    if (origin && this._options.allowedOrigins?.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  }

  protected handleCorsPreflight(req: IncomingMessage, res: ServerResponse) {
    this.applyCorsHeaders(req, res);

    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    res.end();

    this.requestLogger(res);
  }

  protected sendResponse(response: DefaultHTTPResponse, magmaResponse?: MagmaResponse) {
    if (!magmaResponse) magmaResponse = new MagmaResponse(undefined, { status: 204 });

    if (magmaResponse.headers.get('X-Powered-By') || magmaResponse.headers.get('x-powered-by')) {
      magmaResponse.headers.delete('X-Powered-By');
      magmaResponse.headers.delete('x-powered-by');
    }

    if (magmaResponse.headers.get('X-Message') || magmaResponse.headers.get('x-message')) {
      magmaResponse.headers.delete('X-Message');
      magmaResponse.headers.delete('x-message');
    }

    magmaResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });

    if (!this._options.disableHttpSignature) {
      response.setHeader('X-Powered-By', 'MahameruJS');
      response.setHeader('X-Message', 'Indonesia Bisa!');
    }

    response.writeHead(magmaResponse.status);

    let responseBody: unknown;

    if (
      typeof magmaResponse.body === 'string' ||
      magmaResponse.body instanceof Uint8Array ||
      Buffer.isBuffer(magmaResponse.body) ||
      magmaResponse.body === undefined ||
      magmaResponse.body === null
    ) {
      responseBody = magmaResponse.body;
    } else {
      responseBody = JSON.stringify(magmaResponse.body);
    }

    response.end(responseBody);

    this.requestLogger(response);
  }

  protected async runMiddlewarePipeline(
    middleware: MagmaMiddleware,
    context: MagmaContext,
    handler: () => Promise<MagmaResponse> | MagmaResponse,
  ) {
    context.isProtectedRoute = this.validateProtectedRoute(context.method, context.path);
    const response = await middleware(context, async () => {
      const nextResponse = await handler();

      return this.normalizeMagmaResponse(
        nextResponse,
        'Route handlers and next() must resolve to MagmaResponse.',
      );
    });

    return this.normalizeMagmaResponse(
      response,
      'Global middleware must return a MagmaResponse instance.',
    );
  }

  protected async runErrorHandler(error: unknown, context: MagmaContext): Promise<MagmaResponse> {
    const fallbackResponse = this.createInternalServerErrorResponse(error);

    if (!this.container.errorHandler) return fallbackResponse;

    try {
      const handlerResponse = await this.container.errorHandler(
        context,
        error,
        async () => fallbackResponse,
      );

      return this.normalizeMagmaResponse(
        handlerResponse,
        'Error handler must return a MagmaResponse instance.',
      );
    } catch {
      return fallbackResponse;
    }
  }

  protected createInternalServerErrorResponse(error: unknown): MagmaResponse {
    const serverError =
      error instanceof MagmaErrorResponse
        ? error
        : new MagmaErrorResponse(error instanceof Error ? error.message : undefined);

    return MagmaResponse.json({ error: serverError.message }, { status: serverError.statusCode });
  }

  protected isMagmaResponseLike(value: unknown): value is MagmaResponseLike {
    if (!value || typeof value !== 'object') return false;

    if (!('status' in value) || typeof value.status !== 'number') return false;

    if (!('body' in value)) return false;

    if (!('headers' in value) || value.headers === undefined) return true;

    if (value.headers instanceof Headers) return true;

    return (
      typeof value.headers === 'object' && value.headers !== null && !Array.isArray(value.headers)
    );
  }

  protected normalizeMagmaResponse(value: unknown, errorMessage: string): MagmaResponse {
    if (value instanceof MagmaResponse) return value;

    if (!this.isMagmaResponseLike(value)) throw new MagmaErrorResponse(errorMessage);

    const normalizedHeaders =
      value.headers instanceof Headers
        ? Object.fromEntries(value.headers.entries())
        : value.headers;

    return new MagmaResponse(value.body, {
      status: value.status,
      headers: normalizedHeaders,
    });
  }

  protected matchRoutePattern(currentPath: string, routePattern: string): boolean {
    const regexPattern = routePattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\//g, '\\/')
      .replace(/:[^/]+/g, '[^/]+');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(currentPath);
  }

  protected validateProtectedRoute(method: HTTPMethod, path: string): boolean {
    if (path.endsWith('/')) path = path.slice(0, -1);

    return this.container.protectedRoutes.some((route) => {
      if (typeof route === 'string') return this.matchRoutePattern(path, route);

      const isPathMatch = this.matchRoutePattern(path, route.path);
      const isMethodMatch = route.methods.includes(method);

      return isPathMatch && isMethodMatch;
    });
  }

  protected requestLogger(response: DefaultHTTPResponse) {
    if (!this._options.debug && this._options.dev!) return;

    if (response.id) {
      const startTime = this.request.get(response.id);

      if (!startTime)
        return this.logger.info(response.req.method, response.statusCode, response.req.url);

      const requestDuration = Date.now() - startTime;

      this.logger.info(
        response.req.method,
        response.statusCode,
        response.req.url,
        requestDuration,
        'ms',
      );
    } else {
      this.logger.info(response.req.method, response.statusCode, response.req.url);
    }
  }
}

type MagmaGeneratorOptions = {
  debug?: boolean;
  dev?: boolean;
};

const magmaGeneratorDefaultOptions: MagmaGeneratorOptions = {
  debug: false,
  dev: false,
};

export class MagmaGenerator extends Generator<MagmaGeneratorOptions> {
  protected rootPath = process.env.INIT_CWD || process.cwd();

  constructor(options?: Partial<MagmaGeneratorOptions>) {
    super(options ?? magmaGeneratorDefaultOptions);
    this.logger = createLogger(['Magma', 'MagmaGenerator'], this._options.debug);
  }

  public async routeIndexFile(routesIndexFilePath: string) {
    if (!existsSync(routesIndexFilePath)) return;

    if (!existsSync(dirname(routesIndexFilePath)))
      await mkdir(dirname(routesIndexFilePath), { recursive: true });

    const template = `import { type RouteHandler, MahameruResponse } from '@mahameru/magma';

export const GET: RouteHandler = () => {
  return MahameruResponse.json({
    success: true,
    message: 'Welcome to MahameruJS!',
  })
}
`;

    await writeFile(routesIndexFilePath, template, 'utf-8');
  }

  protected async _generate(): Promise<Record<string, unknown>> {
    if (!this._outputTypesDirPath) {
      this.logger.warn('No outputTypesDirPath specified. Skipping types generation.');

      return {};
    }

    const modules = await this.modules();
    const routes = await this.routes();
    const magmaContainer = await this.magmaContainer();

    await this.barrelIndexFile();

    return {
      ...modules,
      ...routes,
      ...magmaContainer,
    };
  }

  protected async modules() {
    if (!existsSync(this._outputTypesDirPath))
      await mkdir(this._outputTypesDirPath, { recursive: true });

    const sourceDirPath = join(this.rootPath, 'src');
    const outputFilePath = join(this._outputTypesDirPath, 'modules.d.ts');
    const modulesDirPath = join(sourceDirPath, 'modules').replace(/\\/g, '/');
    const modulesDirPathGlob = `${modulesDirPath}/**/*.ts`;
    const files = globSync(modulesDirPathGlob);
    this.logger.debug('files', files);
    let importStatements = '';

    const interfaceStructure: { [module: string]: { [type: string]: string } } = {};
    const modules: Record<string, string>[] = [];
    const exportDefaultClassRegex = /export\s+default\s+class\s+([A-Za-z0-9_]+)/;

    for (const filePath of files) {
      if (filePath.endsWith('index.ts') || filePath.endsWith('.d.ts')) continue;

      const code = await readFile(filePath, 'utf-8');
      const match = code.match(exportDefaultClassRegex);

      if (!match) continue;

      const className = match[1];
      const moduleName = basename(dirname(filePath));
      const typeName = basename(filePath).replace('.ts', '');

      let relativePath = relative(this._outputTypesDirPath, filePath);
      relativePath = relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
      if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

      importStatements += `import ${className} from '${relativePath}';\n`;

      if (!interfaceStructure[moduleName]) {
        interfaceStructure[moduleName] = {};
      }
      interfaceStructure[moduleName][typeName] = className;

      const propertyName = className.charAt(0).toLowerCase() + className.slice(1);
      modules.push({ [propertyName]: className });
    }

    let interfaceProperties = '    modules: {\n';
    for (const [moduleName, types] of Object.entries(interfaceStructure)) {
      interfaceProperties += `        ${moduleName}: {\n`;
      for (const [typeName, className] of Object.entries(types)) {
        interfaceProperties += `            ${typeName}: ${className};\n`;
      }
      interfaceProperties += `        }\n`;
    }

    interfaceProperties += '    }\n';

    const fileContent = `// Do not edit this file, it is generated by MahameruJS\n\n${importStatements}\nexport interface Modules {\n${interfaceProperties}}\n`;
    await writeFile(outputFilePath, fileContent, 'utf-8');

    return {
      [basename(outputFilePath)]: modules,
    };
  }

  protected async routes() {
    const sourceDirPath = join(this.rootPath, 'src');
    const routesPath = join(sourceDirPath, 'routes').replace(/\\/g, '/');
    const outputFilePath = join(this._outputTypesDirPath, 'routes.d.ts');
    const foundPaths: string[] = [];

    async function scan(dir: string, currentRoute = '') {
      if (!existsSync(dir)) return;

      const files = await readdir(dir);

      for (const file of files) {
        const fullPath = join(dir, file);
        const statRes = await stat(fullPath);

        if (statRes.isDirectory()) {
          const folderName =
            file.startsWith('[') && file.endsWith(']') ? `:${file.slice(1, -1)}` : file;

          const nextRoute =
            currentRoute === '' && folderName === 'routes'
              ? ''
              : currentRoute === '/'
                ? `/${folderName}`
                : `${currentRoute}/${folderName}`;

          await scan(fullPath, nextRoute);
        } else if (file === 'route.ts' || file === 'route.js') {
          foundPaths.push(currentRoute === '' ? '/' : currentRoute);
        }
      }
    }

    await scan(routesPath, '');

    const uniquePaths = Array.from(new Set(['/', ...foundPaths]));
    const routeUnion = uniquePaths.map((p) => `'${p}'`).join(' | ') || `'/'`;
    const template = `// Do not edit this file, it is generated by MahameruJS\n\nimport { RouteObject } from '@mahameru/magma';\n\ntype MagmaGeneratedRoutes = ${routeUnion};\n\ndeclare module '@mahameru/magma' {\n\texport interface RegisterRoutes {\n\t\troutes: MagmaGeneratedRoutes | RouteObject<MagmaGeneratedRoutes>;\n\t}\n}\n`;

    await writeFile(outputFilePath, template, { encoding: 'utf-8' });

    return {
      [basename(outputFilePath)]: uniquePaths,
    };
  }

  protected async magmaContainer() {
    const dependenciesDtsFilePath: string[] = [];
    const modulesDtsFilePath = join(this._outputTypesDirPath, 'modules.d.ts');
    const instancesDtsFilePath = join(this._outputTypesDirPath, 'instances.d.ts');

    if (existsSync(modulesDtsFilePath)) dependenciesDtsFilePath.push(modulesDtsFilePath);

    if (existsSync(instancesDtsFilePath)) dependenciesDtsFilePath.push(instancesDtsFilePath);

    if (dependenciesDtsFilePath.length === 0) return;

    const outputFilePath = join(this._outputTypesDirPath, 'magma-container.d.ts');
    const exportInterfaceRegex = /export\s+interface\s+([A-Za-z0-9_]+)/g;

    let importStatements = '';
    const interfaceNames: string[] = [];

    for (const filePath of dependenciesDtsFilePath) {
      const fileNameWithoutExt = basename(filePath, extname(filePath)).replace('.d', '');

      const code = await readFile(filePath, 'utf-8');
      const matches = [...code.matchAll(exportInterfaceRegex)];

      if (matches.length === 0) continue;

      const namedImports: string[] = [];
      for (const match of matches) {
        const interfaceName = match[1];
        interfaceNames.push(interfaceName);
        namedImports.push(interfaceName);
      }

      importStatements += `import { ${namedImports.join(', ')} } from './${fileNameWithoutExt}';\n`;
    }

    if (interfaceNames.length === 0) return;

    const extendsClause = interfaceNames.join(', ');
    const fileContent = `// Do not edit this file, it is generated by MahameruJS\n\n${importStatements} \ndeclare module '@mahameru/magma' {\n\texport interface MagmaContainer extends ${extendsClause} {}\n}\n`;

    await writeFile(outputFilePath, fileContent, 'utf8');

    return {
      [basename(outputFilePath)]: interfaceNames,
    };
  }

  protected async barrelIndexFile(): Promise<void> {
    try {
      const dirPath = this._outputTypesDirPath;

      if (!existsSync(dirPath)) return;

      const items = await readdir(dirPath).catch((error) => {
        if (error.code === 'ENOENT') return [];

        throw error;
      });

      const exportLinesPromises = items.map(async (item) => {
        if (item.startsWith('index.')) return null;

        const fullPath = join(dirPath, item);
        const stats = await stat(fullPath);
        const isDirectory = stats.isDirectory();

        if (isDirectory || item.endsWith('.ts') || item.endsWith('.js')) {
          if (isDirectory) {
            const targetPath = '.' + '/' + item;

            return `export * from '${targetPath}'`;
          }

          const targetPath = '.' + '/' + item.split('.d')[0];

          return `export * from '${targetPath}'`;
        }

        return null;
      });

      const exportLines = (await Promise.all(exportLinesPromises)).filter(
        (value): value is string => value !== null,
      );

      if (exportLines.length === 0) return;

      const fileContent =
        '// Do not edit this file, it is generated by MahameruJS' +
        '\n\n' +
        exportLines.join('\n') +
        '\n';
      const outputPath = join(dirPath, 'index.d.ts');
      await writeFile(outputPath, fileContent, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to create index.d.ts:`, error);
    }
  }
}

export { type MagmaRequest } from './magma-request';
export { MagmaResponse } from './magma-response';
export {
  type MagmaMiddleware,
  type ProtectedRoute,
  type RouteHandler,
  type RouteObject,
  type MagmaContainer,
} from './types';

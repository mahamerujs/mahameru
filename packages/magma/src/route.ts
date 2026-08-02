import type { MagmaRequest } from './magma-request.js';
import { MagmaResponse } from './magma-response.js';
import type { HTTPMethod, MagmaContext } from './types.js';
import { MagmaErrorResponse } from './magma-error-response.js';
import { BaseClass } from '@mahameru/tephra';
import { dirname, relative } from 'node:path';
import { HTTP_METHOD } from './constants.js';
import type { Container } from './container.js';

type RouteOptions = {
  dev: boolean;
  debug: boolean;
  routesDirPath: string;
};

export type RequestParams = {
  [key: string]: string;
};

export type RouteHandler = (context: MagmaContext) => Promise<MagmaResponse> | MagmaResponse;

export type RouteHandlers = Partial<Record<HTTPMethod, RouteHandler>>;

export interface RouteItem {
  path: string;
  regex: RegExp;
  paramNames: (keyof RequestParams)[];
  routeHandlers: RouteHandlers;
}

export class Route extends BaseClass<RouteOptions> {
  protected container: Container;
  public readonly items: Map<string, RouteItem> = new Map();

  constructor(options: RouteOptions, container: Container) {
    super('MagmaRoute', options);
    this.container = container;
  }

  public findMatchedRoute(matchUrl: string) {
    let matchedRoute: RouteItem | null = null;
    let matchResult: RegExpExecArray | null = null;

    for (const route of this.items.values()) {
      const result = route.regex.exec(matchUrl);

      if (result) {
        matchedRoute = route;
        matchResult = result;

        break;
      }
    }

    return { matchedRoute, matchResult };
  }

  public loadRoutes() {
    for (const [fullPath, routeItems] of this.container.items) {
      if (!fullPath.startsWith(this.options.routesDirPath)) continue;

      const currentDir = dirname(fullPath);
      const relativePath = relative(this.options.routesDirPath, currentDir);

      let path = '/' + relativePath.replace(/\\/g, '/');
      path = path.replace(/\/+/g, '/');

      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

      const paramNames: RouteItem['paramNames'] = [];
      const paramMatches = path.match(/\[([^\]]+)\]/g);

      if (paramMatches)
        paramMatches.forEach((match) => {
          paramNames.push(match.slice(1, -1));
        });

      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexPattern = escaped.replace(/\\\[([^\\\]]+)\\\]/g, '([^/]+)');
      const regex = new RegExp(`^${regexPattern}$`);
      const routeHandlers: RouteHandlers = {};

      for (const routeItem of routeItems) {
        if (HTTP_METHOD.includes(routeItem.name as HTTPMethod)) {
          routeHandlers[routeItem.name as HTTPMethod] = routeItem.item as RouteHandler;
        }
      }

      this.items.set(fullPath, {
        paramNames,
        path,
        routeHandlers,
        regex,
      });
    }
  }

  public normalizePathForMatching(path: string): string {
    if (path.length > 1 && path.endsWith('/')) {
      return path.slice(0, -1);
    }

    return path;
  }

  async resolveRoute(request: MagmaRequest) {
    const rawReqPath = request.url.split('?')[0] || '/';
    const rawReqUrl = rawReqPath.replace(/\/+/g, '/');
    const matchUrl = this.normalizePathForMatching(rawReqUrl);

    const { matchedRoute, matchResult } = this.findMatchedRoute(matchUrl);

    if (!matchedRoute || !matchResult)
      return {
        matchedRoute: null,
        matchResult: null,
        notFoundResponse:
          (await this.runNotFoundHandler(request, request.method)) ||
          MagmaResponse.json({ error: 'Not Found' }, { status: 404 }),
      };

    return { matchedRoute, matchResult };
  }

  async runNotFoundHandler(
    _request: MagmaRequest,
    _method: HTTPMethod,
  ): Promise<MagmaResponse | undefined> {
    return undefined;
    // if (!this.container.notFoundHandler) return undefined;

    // const handler = this.container.notFoundHandler[method];

    // if (typeof handler !== 'function') {
    //   return undefined;
    // }
    // const context: MagmaContext = {
    //   request,
    //   container: this.container,
    //   params: {},
    //   path: request.url,
    //   method,
    //   status: 404,
    //   isProtectedRoute: false,
    // };
    // const response = await handler(context);

    // return this.normalizeMagmaResponse(
    //   response,
    //   `Not found handler for method '${method}' must return a MagmaResponse instance.`,
    // );
  }

  protected isMagmaResponseLike(
    value: unknown,
  ): value is { body: unknown; status: number; headers?: Headers | Record<string, string> } {
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

    return (
      typeof value.headers === 'object' && value.headers !== null && !Array.isArray(value.headers)
    );
  }

  protected normalizeMagmaResponse(value: unknown, errorMessage: string): MagmaResponse {
    if (value instanceof MagmaResponse) {
      return value;
    }

    if (!this.isMagmaResponseLike(value)) {
      throw new MagmaErrorResponse(errorMessage);
    }

    const normalizedHeaders =
      value.headers instanceof Headers
        ? Object.fromEntries(value.headers.entries())
        : value.headers;

    return new MagmaResponse(value.body, {
      status: value.status,
      headers: normalizedHeaders,
    });
  }
}

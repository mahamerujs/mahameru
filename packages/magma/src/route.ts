import type { MagmaRequest } from './magma-request';
import { MagmaResponse } from './magma-response';
import type { Container } from './container';
import type { HTTPMethod, MagmaContext, RouteItem } from './types';
import { MagmaErrorResponse } from './magma-error-response';
import { createLogger, type Logger } from '@mahameru/diatrema';

type RouteOptions = {
  debug: boolean;
};

export type RouteDependencies = {
  container: Container;
};

export class Route {
  public readonly dependencies: RouteDependencies;
  public logger: Logger;
  public readonly options: RouteOptions;

  constructor(options: RouteOptions, dependencies: RouteDependencies) {
    this.options = options;
    this.dependencies = dependencies;
    this.logger = createLogger(['Magma', 'Container'], this.options.debug);
  }

  normalizePathForMatching(path: string): string {
    if (path.length > 1 && path.endsWith('/')) {
      return path.slice(0, -1);
    }

    return path;
  }

  findMatchedRoute(matchUrl: string) {
    let matchedRoute: RouteItem | null = null;
    let matchResult: RegExpExecArray | null = null;

    for (const route of this.dependencies.container.routeItems) {
      const result = route.regex.exec(matchUrl);

      if (result) {
        matchedRoute = route;
        matchResult = result;

        break;
      }
    }

    return { matchedRoute, matchResult };
  }

  async runNotFoundHandler(
    request: MagmaRequest,
    method: HTTPMethod,
  ): Promise<MagmaResponse | undefined> {
    if (!this.dependencies.container.notFoundHandler) return undefined;

    const handler = this.dependencies.container.notFoundHandler[method];

    if (typeof handler !== 'function') {
      return undefined;
    }
    const context: MagmaContext = {
      request,
      container: this.dependencies.container,
      params: {},
      path: request.url,
      method,
      status: 404,
      isProtectedRoute: false,
    };
    const response = await handler(context);

    return this.normalizeMagmaResponse(
      response,
      `Not found handler for method '${method}' must return a MagmaResponse instance.`,
    );
  }

  async resolveRoute(request: MagmaRequest) {
    const rawReqPath = request.url.split('?')[0] || '/';
    const rawReqUrl = rawReqPath.replace(/\/+/g, '/');
    const matchUrl = this.normalizePathForMatching(rawReqUrl);

    let { matchedRoute, matchResult } = this.findMatchedRoute(matchUrl);

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

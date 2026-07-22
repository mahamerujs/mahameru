import type { MagmaRequest } from './magma-request';
import type { MagmaResponse } from './magma-response';

export enum HTTPMethodEnum {
  GET = 'GET',
  HEAD = 'HEAD',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  CONNECT = 'CONNECT',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
  PATCH = 'PATCH',
}

export type HTTPMethod = `${HTTPMethodEnum}`;

export interface Modules {}
export interface MagmaContainer extends Modules {}

export interface MagmaContext {
  request: MagmaRequest;
  container: MagmaContainer;
  params: RequestParams;
  path: string;
  method: HTTPMethod;
  status: number;
  isProtectedRoute: boolean;
}

export type MagmaMiddleware = (
  context: MagmaContext,
  next: MagmaNext,
) => Promise<MagmaResponse> | MagmaResponse;

export type MagmaNext = () => Promise<MagmaResponse>;

export type RouteObject<T extends string = string> = {
  path: T;
  methods: HTTPMethod[];
};

export interface RegisterRoutes {}

export type ProtectedRoute = RegisterRoutes extends { routes: infer R }
  ? R[]
  : (string | RouteObject<string>)[];

export type RequestParams = {
  [key: string]: string;
};

export type ErrorHandler = (
  context: MagmaContext,
  error: unknown,
  next: MagmaNext,
) => Promise<MagmaResponse> | MagmaResponse;

export type RouteHandler = (context: MagmaContext) => Promise<MagmaResponse> | MagmaResponse;

export type RouteHandlers = Partial<Record<HTTPMethod, RouteHandler>>;

export interface RouteItem {
  path: string;
  regex: RegExp;
  paramNames: (keyof RequestParams)[];
  routeHandlers: RouteHandlers;
  pathFS: string;
}

export type ClassConstructor<T = unknown> = new (magmaContainer: MagmaContainer) => T;
export type ModuleMeta = {
  module: string;
  type: 'controller' | 'service';
};
export type ContainerItemID = string;
export type ContainerItem =
  | {
      name: string;
      path: string;
      type: 'module-service';
      isPublic: boolean;
      item: unknown;
      moduleMeta?: ModuleMeta;
    }
  | {
      name: string;
      path: string;
      type: 'module-controller';
      isPublic: boolean;
      item: unknown;
      moduleMeta?: ModuleMeta;
    }
  | { name: string; path: string; type: 'route'; isPublic: boolean; item: RouteItem }
  | { name: string; path: string; type: 'middleware'; isPublic: boolean; item: MagmaMiddleware }
  | {
      name: string;
      path: string;
      type: 'not-found';
      isPublic: boolean;
      item: Partial<Record<HTTPMethod, RouteHandler>>;
    }
  | { name: string; path: string; type: 'error-handler'; isPublic: boolean; item: ErrorHandler }
  | {
      name: string;
      path: string;
      type: 'protected-route';
      isPublic: boolean;
      item: ProtectedRoute;
    };

export type ContainerRegistry = Map<ContainerItemID, ContainerItem>;

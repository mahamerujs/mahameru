# MahameruJS

[![npm version](https://img.shields.io/npm/v/mahameru.svg)](https://www.npmjs.com/package/mahameru)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> ⚠️ **IMPORTANT NOTICE:** This package is currently under active development and is **not yet ready for production use**. 

---

## 🚧 Work in Progress

**mahameru** is still in its early stages. APIs, features, and configurations are subject to drastic changes without prior notice. 

* **Current Status:** Experimental / Alpha
* **Production Ready:** No

### Installing for testing
If you want to experiment with it or contribute, you can install it via npm:

Go to your favorite directory projects and run:
```bash
npm create mahameru@latest
```
or
```bash
npx create-mahameru@latest
```
and follow the prompts.

That's it!

## Module conventions

Mahameru discovers modules from the directory configured as `modulesPath`, typically:

- `src/modules/<name>/service.ts`
- `src/modules/<name>/controller.ts`

During production runtime, the same convention is resolved from build output in `dist/` as:

- `dist/modules/<name>/service.js`
- `dist/modules/<name>/controller.js`

Each module folder may contain:

- `service.ts` for container-registered services
- `controller.ts` for container-registered controllers

If both files exist, Mahameru registers the service first and injects it into the controller constructor. If only `controller.ts` exists, the controller is still registered without service injection.

> **Breaking change:** The legacy naming convention `<name>.service.ts` and `<name>.controller.ts` is no longer supported.

## Global middleware

Mahameru supports a convention-based global middleware:

- `src/middleware.ts`
- fallback `src/middleware.js`

The file must export a default middleware function with the signature below:

```ts
import type { MahameruMiddleware } from 'mahameru';

const middleware: MahameruMiddleware = async (_context, _isProtectedRoute, next) => {
    try {
        // Middleware logic...

        return await next();
    } catch (error) {
        throw error;
    }
};

export default middleware;
```

Example with route-specific conditions:

```ts
import type { MahameruMiddleware, ProtectedRoute } from 'mahameru';
import { authValidation } from './helpers/auth-middleware';

export const protectedRoutes: ProtectedRoute<MahameruGeneratedRoutes> = [
    '/user',
    '/me'
];

const middleware: MahameruMiddleware = async (context, isProtectedRoute, next) => {
    try {
        const { request, container } = context;

        // Example login using query
        // http://localhost:3000/user?auth={"username":"bintan","secret":"1234"}
        if (isProtectedRoute)
            await authValidation(request, container);

        // Other middleware logic...

        return await next();
    } catch (error) {
        throw error;
    }
};

export default middleware;
```

Because this middleware is global, filtering for specific routes should be done inside the middleware itself with `if` conditions using `path` and `method`.

## Error handler

Mahameru supports a convention-based global error handler:

- `src/error.ts`
- fallback `src/error.js`

The file must export a default function:

```ts
import { type MahameruErrorHandler, MahameruResponse } from "mahameru";
import { NotFoundError, UnauthorizedError } from "./common/error";

const errorHandler: MahameruErrorHandler = async ({ error }) => {
    if (error instanceof UnauthorizedError || error instanceof NotFoundError)
        return MahameruResponse.json({
            success: false,
            error: error.code,
            message: error.message
        }, { status: error.statusCode });

    console.error(error);

    return MahameruResponse.json({
        success: false,
        error: 'Internal Server Error'
    }, { status: 500 });
}

export default errorHandler

```

The handler receives the request context plus `error`, and may either return a custom response directly or call `next()` to use Mahameru's fallback internal server response.

## Not found handler

Mahameru supports a convention-based custom not-found handler:

- `src/routes/not-found.ts`
- fallback `src/routes/not-found.js`

This file follows the same route-style method exports as other route files:

```ts
import { MahameruResponse, type RouteHandler } from 'mahameru'

export const GET: RouteHandler = (request) => {
    return MahameruResponse.json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Route not found',
        path: request.path
    }, { status: 404 });
}
```

The not-found handler is only used when no route matches the incoming request. For v1, it does not run through the global middleware pipeline.

> **Note:** The **mahameru** package is still in its early stages and is not yet ready for production use. Please use it at your own risk and be aware of the limitations and potential issues.

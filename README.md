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
import { type MahameruMiddleware } from 'mahameru/core';

async function middleware(context: MahameruMiddlewareContext, next: MahameruNext): Promise<MahameruResponse> {
    return next();
}

export default middleware;
```

Example with route-specific conditions:

```ts
import { type MahameruMiddlewareContext, type MahameruNext, MahameruResponse } from 'mahameru/core';
import { authValidation } from './helpers/auth-middleware.js';

const protectedRoutes = ['/user'];

export default async function middleware({ request, path, container, params }: MahameruMiddlewareContext, next: MahameruNext): Promise<MahameruResponse> {
    try {
        if (protectedRoutes.some(route => path.startsWith(route)))
            await authValidation(request, path, container, params, protectedRoutes);

        // Other middleware logic...

        return await next();
    } catch (error) {
        throw error
    }
};
```

Because this middleware is global, filtering for specific routes should be done inside the middleware itself with `if` conditions using `path` and `method`.

## Error handler

Mahameru supports a convention-based global error handler:

- `src/error.ts`
- fallback `src/error.js`

The file must export a default function:

```ts
import { MahameruError, MahameruHttpServerError, MahameruResponse, type MahameruErrorHandlerContext } from "mahameru/core";
import { UnauthorizedError } from "./common/error.js";

export default async function errorHandler({ error }: MahameruErrorHandlerContext) {
    if (error instanceof UnauthorizedError)
        return MahameruResponse.json({ success: false, error: error.name, message: error.message }, { status: error.statusCode });

    if (error instanceof Error)
        return MahameruResponse.json({ success: false, error: error.name, message: error.message }, { status: 400 });

    console.error(error);

    if (error instanceof MahameruHttpServerError || error instanceof MahameruError)
        return MahameruResponse.json({ success: false, error: error.name, message: error.message }, { status: 500 });

    return MahameruResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
}
```

The handler receives the request context plus `error`, and may either return a custom response directly or call `next()` to use Mahameru's fallback internal server response.

## Not found handler

Mahameru supports a convention-based custom not-found handler:

- `src/routes/not-found.ts`
- fallback `src/routes/not-found.js`

This file follows the same route-style method exports as other route files:

```ts
import { MahameruResponse, type MahameruContainer, type MahameruRequest, type RouteHandlerContext } from 'mahameru/core'

export async function GET(request: MahameruRequest, container: MahameruContainer, context: RouteHandlerContext) {
    const path = request.url.split('?')[0];

    return MahameruResponse.json({ success: false, error: 'NOT_FOUND', message: 'Route not found', path }, { status: 404 });
}
```

The not-found handler is only used when no route matches the incoming request. For v1, it does not run through the global middleware pipeline.

> **Note:** The **mahameru** package is still in its early stages and is not yet ready for production use. Please use it at your own risk and be aware of the limitations and potential issues.

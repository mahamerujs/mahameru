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

async function middleware({ path, method, request }: MahameruMiddlewareContext, next: MahameruNext): Promise<MahameruResponse> {
    const { query } = request

    if (path.startsWith('/user') && method === 'GET') {
        const secret = '1234'

        if (query.get('secret') !== secret) {
            return MahameruResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }
    }

    if (path === '/' && method === 'GET') {
        return MahameruResponse.json({
            success: true,
            message: 'Intercepted by middleware'
        });
    }

    const response = await next();

    if (path.startsWith('/user')) {
        response.headers = {
            ...response.headers,
            'X-Protected-Route': 'true'
        };
    }

    return response;
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
import { MahameruResponse, type MahameruErrorHandlerContext, type MahameruNext } from 'mahameru/core';

export default async function errorHandler(
    { error }: MahameruErrorHandlerContext,
    next: MahameruNext
): Promise<MahameruResponse> {
    if (error instanceof Error) {
        return MahameruResponse.json(
            { success: false, error: error.message },
            { status: 400 }
        );
    }

    return next();
}
```

The handler receives the request context plus `error`, and may either return a custom response directly or call `next()` to use Mahameru's fallback internal server response.

## Not found handler

Mahameru supports a convention-based custom not-found handler:

- `src/routes/not-found.ts`
- fallback `src/routes/not-found.js`

This file follows the same route-style method exports as other route files:

```ts
import { MahameruResponse } from 'mahameru/core';

export async function GET() {
    return MahameruResponse.json(
        { success: false, error: 'Not Found' },
        { status: 404 }
    );
}
```

The not-found handler is only used when no route matches the incoming request. For v1, it does not run through the global middleware pipeline.

> **Note:** The **mahameru** package is still in its early stages and is not yet ready for production use. Please use it at your own risk and be aware of the limitations and potential issues.

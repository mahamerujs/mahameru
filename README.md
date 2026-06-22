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

Mahameru supports a convention-based global middleware file in your consumer app:

- `src/middleware.ts`
- fallback `src/middleware.js`

The file must export a default middleware function with the signature below:

```ts
import { type MahameruMiddleware } from 'mahameru/core';

const middleware: MahameruMiddleware = async (context, next) => {
    return next();
};

export default middleware;
```

Example with route-specific conditions:

```ts
import { MahameruResponse, type MahameruMiddleware } from 'mahameru/core';

const middleware: MahameruMiddleware = async ({ path, method, request }, next) => {
    if (path.startsWith('/user') && method === 'GET') {
        const apiKey = request.headers['x-api-key'];

        if (apiKey !== 'secret-key') {
            return MahameruResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }
    }

    if (path === '/' && method === 'GET') {
        return MahameruResponse.json({
            framework: 'Custom Node Backend Framework',
            status: 'Intercepted by middleware'
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

> **Note:** The **mahameru** package is still in its early stages and is not yet ready for production use. Please use it at your own risk and be aware of the limitations and potential issues.

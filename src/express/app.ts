import express, { type Router, type CookieOptions } from 'express'
import helmet from 'helmet'
import { createCorsMiddleware, createErrorMiddleware, filterMiddleware, notFoundMiddleware } from './middleware/index.js'
import cookieParser from "cookie-parser";

type CreateExpressAppOptions = {
    appName: string
    allowedOrigins: string[]
    cookieSecret: string
    cookieOptions: CookieOptions
    routes?: {
        public: Router
        private: Router
    }
}

const createExpressApp = (options: CreateExpressAppOptions) => {
    const app = express()

    app.set('trust proxy', 1)
    app.disable('x-powered-by')
    app.use(helmet())
    app.use(createCorsMiddleware(options.allowedOrigins))
    app.use(filterMiddleware)
    app.use(express.json({ limit: '1mb' }))
    app.use(cookieParser(options.cookieSecret))
    app.use(
        express.urlencoded({
            extended: true,
            limit: '1mb'
        })
    )

    app.use(
        express.static('public', {
            dotfiles: 'deny',
            etag: true,
            immutable: false,
            index: false,
            lastModified: true,
            maxAge: '1h'
        })
    )

    app.get('/', (request, response) => {
        return response.status(200).json({
            success: true,
            message: `Welcome to ${options.appName}`,
            data: {
                userAgent: request.userAgent,
                ipAddress: request.ipAddress
            }
        })
    })

    if (options.routes) {
        app.use(options.routes.public)
        app.use(options.routes.private)
    }

    app.use(notFoundMiddleware)
    app.use(createErrorMiddleware(options.cookieOptions))

    return app
}

export default createExpressApp

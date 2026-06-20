import { Request, Response, NextFunction, CookieOptions } from 'express'
import { APIError } from '../../api.error.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

const createErrorMiddleware = (cookieTokenOptions: CookieOptions) =>
    (error: unknown, req: Request, res: Response, _: NextFunction) => {
        try {
            res.setHeader('Cache-Control', 'no-store')

            if (error instanceof APIError) {
                if (error.code === 'INTERNAL_SERVER_ERROR') {
                    console.error(error)

                    return res.status(error.status).json({
                        success: false,
                        error: error.code,
                        message: 'An internal error is happening. Please contact developer as soon as possible!'
                    })
                }

                if (error.code === 'TOKEN_NOT_FOUND')
                    if (req.cookies.token)
                        res.clearCookie('token', cookieTokenOptions)

                if (isPlainObject(error.details) && 'retryIn' in error.details && typeof error.details.retryIn === 'number')
                    res.setHeader('Retry-After', error.details.retryIn)

                const responseBody = {
                    success: false,
                    error: error.code,
                    ...(error.message ? { message: error.message } : {}),
                    ...(isPlainObject(error.details) ? error.details : {})
                }

                return res.status(error.status).json(responseBody)
            }

            if (error instanceof SyntaxError) {
                return res.status((error as any).statusCode).json({
                    success: false,
                    error: 'JSON_PARSE_ERROR',
                    message: error.message
                })
            }

            if (error instanceof Error) {
                console.error(error)

                return res.status(500).json({
                    success: false,
                    error: 'UNKNOWN_ERROR',
                    message: 'An unknown error is happening. Please contact developer as soon as possible!'
                })
            }

            console.error('errorHandlerMiddleware', error)

            return res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An internal error is happening. Please contact developer as soon as possible!'
            })
        } catch (error) {
            console.error('errorHandlerMiddleware', error)

            return res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An internal error is happening. Please contact developer as soon as possible!'
            })
        }
    }

export default createErrorMiddleware

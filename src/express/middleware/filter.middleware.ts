
import { Request, Response, NextFunction } from 'express'

export default async function filterMiddleware(request: Request, response: Response, next: NextFunction) {
    if (!request.ip || !request.headers['user-agent'])
        throw new Error('Access denied')

    request.ipAddress = request.ip
    request.userAgent = request.headers['user-agent']

    if (request.path.length > 1 && request.path.endsWith('/')) {
        const newPath = request.path.slice(0, -1)
        const query = request.url.slice(request.path.length)

        return response.redirect(301, newPath + query)
    }

    return next()
}

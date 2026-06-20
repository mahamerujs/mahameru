
import { Request } from 'express'
import { APIError } from '../../api.error.js'

export default async function notFoundMiddleware(request: Request) {
    throw new APIError('ROUTE_NOT_FOUND', `Route ${request.path} is not found!`)
}

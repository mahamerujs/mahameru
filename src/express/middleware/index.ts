import createCorsMiddleware from './cors.middleware.js'
import filterMiddleware from './filter.middleware.js'
import notFoundMiddleware from './not-found.middleware.js'
import createErrorMiddleware from './error.middleware.js'

export {
    createCorsMiddleware,
    filterMiddleware,
    notFoundMiddleware,
    createErrorMiddleware
}

const middleware = {
    createCorsMiddleware,
    filterMiddleware,
    notFoundMiddleware,
    createErrorMiddleware
}

export default middleware

import cors, { CorsOptions, CorsRequest } from 'cors'


const createCorsMiddleware = (allowedOrigins: string[]) => {
    return cors((req: CorsRequest, callback: (err: Error | null, options?: CorsOptions | undefined) => void) => {
        let origin = req.headers['origin']

        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, {
                origin: true,
                methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
                credentials: true
            })
        } else {
            callback(null, {
                origin: false
            })
        }
    })
}

export default createCorsMiddleware

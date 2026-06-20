
import { createServer, Server } from 'node:http'
import { Express } from 'express'
import MahameruError from './error.js'

type CreateHttpServerOptions = {
    port?: number
    host?: string
}

export default function createHttpServer(app: Express, existingHttpServer?: Server, options: CreateHttpServerOptions = {}) {
    return new Promise<Server>((resolve, reject) => {
        const httpServer = createServer(app)
        const PORT = options.port || 3000
        const HOST = options.host || 'localhost'

        if (existingHttpServer)
            return resolve(existingHttpServer)

        httpServer.listen(PORT, HOST, undefined, async () => {
            const address = httpServer.address()

            if (address && typeof address !== 'string') {
                console.log('HTTP Server', `Listening on http://${HOST} ${PORT} ${address.family}`)
            } else {
                console.log('HTTP Server', `Listening on ${address}`)
            }

            resolve(httpServer)
        })

        httpServer.on('close', () => {
            console.log('HTTP Server', 'Server closed')

            process.exit(0)
        })

        httpServer.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                reject(new MahameruError(`Port ${PORT} is already in use`))

                return
            } else {
                console.error('System', err)
            }

            reject(err)
        })
    })
}

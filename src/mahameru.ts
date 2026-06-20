import MahameruError from "./error.js"
import { writeFile } from 'fs/promises'
import path from "path"
import type { Server } from "http"
import { existsSync } from "fs"
import { spawn } from "child_process"
import { __dirname } from "./constants.js"
import createExpressApp from "./express/app.js"
import type { CookieOptions } from "express"
import createHttpServer from "./http.js"

type MahameruOptions = {
    /**
     * App name
     * @default 'Mahameru'
     */
    appName?: string
    /**
     * Development mode
     */
    dev?: boolean
    /**
     * HTTP Listen port
     * @default 3000
     */
    port?: number
    /**
     * HTTP Listen host
     * @default localhost
     */
    host?: string
}

export type MahameruConfig = {
    /**
     * Cookie secret
     * @default 'secret'
     */
    cookieSecret?: string
    /**
     * Cookie options
     * @default {}
     */
    cookieOptions?: CookieOptions
    /**
     * Mahameru options
     */
    options: MahameruOptions
    /**
     * HTTP Server
     * note: if set, will be used instead of creating a new one. options.port and options.host will be ignored.
     * @default undefined
     */
    httpServer?: Server
    /**
     * HTTP Allowed origins
     * @default undefined
     */
    httpAllowedOrigins?: string[]
    /**
     * Override default SIGINT handlers
     * @param signal 
     * @returns void
     */
    onSigint?: (signal?: NodeJS.Signals) => void
    /**
     * Override default SIGTERM handlers
     * @param signal 
     * @returns void
     */
    onSigterm?: (signal?: NodeJS.Signals) => void
}

export class Mahameru {
    private readonly config: MahameruConfig
    private rootDir: string = process.cwd()
    private databasesDir = path.join(this.rootDir, 'src', 'databases')
    private readonly isCommonJS = typeof module !== 'undefined' && !!module.exports;
    private readonly isBuild = __dirname.includes('dist')
    protected shouldInitDB = true

    constructor(config: MahameruConfig) {
        this.config = config

        if (!this.config)
            throw new MahameruError('Mahameru config is not provided')

        if (!this.config.options)
            throw new MahameruError('Mahameru config.options is not provided')

        if (!existsSync(this.rootDir))
            throw new MahameruError('Root directory does not exist')

        if (!existsSync(path.join(this.rootDir, 'src')))
            throw new MahameruError('src directory does not exist')

        if (typeof this.config.options.dev === 'undefined')
            this.config.options.dev = false

        if (!existsSync(this.databasesDir))
            this.shouldInitDB = false
    }

    async initialize() {
        console.log('Preparing mahameru...')

        if (this.config.options.dev)
            await this.preInitDevelopment(this.shouldInitDB)

        console.log(`Starting mahameru on port ${this.config.options.port} in ${this.config.options.dev ? 'development' : 'production'} mode...`)

        const app = createExpressApp({
            allowedOrigins: this.config.httpAllowedOrigins || [],
            cookieSecret: this.config.cookieSecret || 'secret',
            cookieOptions: this.config.cookieOptions || {},
            appName: this.config.options.appName || 'Mahameru'
        })

        const httpServer = await createHttpServer(app, this.config.httpServer, {
            port: this.config.options.port,
            host: this.config.options.host
        })

        console.log('Mahameru is ready!')

        const shutdown = async (signal?: NodeJS.Signals) => {
            if (signal)
                console.log('shutdown', `Received signal ${signal}`)

            httpServer.close()

            console.log('shutdown', `Shutdown complete.`)
        }

        process.on('SIGINT', this.config.onSigint || shutdown)
        process.on('SIGTERM', this.config.onSigterm || shutdown)
    }

    protected async preInitDevelopment(shouldInitDB = false) {
        await this.createRequiredEnvFile()

        const tsxPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', this.isCommonJS ? 'cli.cjs' : 'cli.mjs');
        const preInitScriptPath = `node_modules${path.sep}mahameru${path.sep}${this.isBuild ? 'dist' : 'src'}${path.sep}lib${path.sep}pre-init-dev-script.${this.isCommonJS ? 'cjs' : 'js'}`

        const args = [
            tsxPath,
            '--tsconfig', 'tsconfig.json',
            preInitScriptPath,
            shouldInitDB ? '--init-db' : null,
        ].filter(Boolean) as string[];

        return await new Promise<number | null>((resolve, reject) => {
            const child = spawn(
                'node',
                args,
                {
                    stdio: 'inherit',
                    env: { ...process.env, NODE_ENV: 'development' }
                }
            );

            child.on('close', (code) => {
                resolve(code)
            });

            child.on('error', (err) => {
                reject(err)
            });
        })

    }

    protected async createRequiredEnvFile() {
        const envDefaultPath = path.join(this.rootDir, '.env')
        const envDevelopmentPath = path.join(this.rootDir, '.env.development')

        if (!existsSync(envDefaultPath))
            await writeFile(envDefaultPath, 'APP_NAME=Mahameru Node.js Framework', 'utf-8')

        if (!existsSync(envDevelopmentPath)) {
            const devEnv = ``

            await writeFile(envDevelopmentPath, devEnv, 'utf-8')
        }
    }

    protected isClass(v: unknown): boolean {
        return typeof v === 'function' && /^\s*class\s+/.test(v.toString());
    }
}

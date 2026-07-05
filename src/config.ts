import { join } from "node:path";

export interface MahameruBaseConfig {
    dev: boolean;
    rootPath: string;
    appPath: string;
    productionDir: string;
    developmentDir: string;
    httpServerSignature: string;
    modulesDir: string;
    routesDir: string;
}

export interface MahameruConfig {
    /**
     * Application name.
     * Name cannot contain spaces.
     * @type {string}
     * @default 'MahameruJS'
     * @example 'My-Example-App'
     */
    name: string;
    /**
     * Server port.
     * @type {number}
     * @default 3000
     */
    port: number;
    /**
     * Server host.
     * @type {string}
     * @default 'localhost'
     */
    host: string;
    /**
     * Enable or disable the trailing slash.
     * @type {boolean}
     * @default false
     */
    trailingSlash: boolean;
    /**
     * Allowed origins for CORS. Set to `undefined` to disable CORS.
     * @type {string[] | undefined}
     * @default undefined
     */
    allowedOrigins?: string[];
    /**
     * Disable the HTTP signature response header.
     * X-Powered-By: MahameruJS
     * @type {boolean}
     * @default false
     */
    disableHttpSignatureResponse: boolean;
}

export type MahameruExtendedConfig = MahameruBaseConfig & MahameruConfig;

export const mahameruDefaultBaseConfig: MahameruBaseConfig = {
    dev: process.env.MAHAMERU__MODE?.trim() === 'development',
    rootPath: process.cwd(),
    get appPath(): string {
        return join(this.rootPath, this.developmentDir)
    },
    productionDir: '.mahameru',
    developmentDir: '.mahameru',
    httpServerSignature: 'MahameruJS',
    modulesDir: 'modules',
    routesDir: 'routes',
}

export const mahameruDefaultConfig: MahameruConfig = {
    name: "MahameruJS",
    port: process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT) : 3000,
    host: process.env.MAHAMERU__HTTP_LISTEN_HOST || 'localhost',
    allowedOrigins: undefined,
    trailingSlash: false,
    disableHttpSignatureResponse: false
};

export type Config = (defaultConfig: MahameruConfig) => Promise<Partial<MahameruConfig>>;

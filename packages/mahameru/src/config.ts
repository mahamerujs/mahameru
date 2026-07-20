export interface MahameruConfig {
    /**
     * Server port.
     * @type {number}
     * @default 3000
     */
    port: number;
    /**
     * Server host.
     * @type {string}
     * @default '127.0.0.1'
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
     * Allowed IPs in request that does not have origin header. Set to `undefined` to disable IP restriction.
     * @type {string[] | undefined}
     * @default undefined
     */
    allowedIps?: string[];
    /**
     * Allowed hosts to connect to MahameruJS
     * @type {string[] | '*'}
     * @default '*'
     * @example
     * allowedHosts: ['localhost', '127.0.0.1']
     */
    allowedHosts?: string[];
    /**
     * Disable the HTTP signature response header.
     * X-Powered-By: MahameruJS
     * @type {boolean}
     * @default false
     */
    disableHttpSignature: boolean;
    /**
     * Enable or disable debug mode.
     * @type {boolean}
     * @default false
     */
    debug: boolean;
}

export const mahameruDefaultConfig: MahameruConfig = {
    port: 3000,
    host: '127.0.0.1',
    allowedOrigins: undefined,
    allowedIps: undefined,
    trailingSlash: false,
    disableHttpSignature: false,
    debug: false,
    allowedHosts: undefined
};

/**
 * Context object provided to the MahameruJS configuration callback.
 * 
 * @typedef {Object} MahameruConfigHandlerContext
 * @property {boolean} isDevelopmentMode - State flag indicating if the environment is in development mode (`process.env.MAHAMERU__DEV === 'true'`).
 */
export type MahameruConfigHandlerContext = {
    isDevelopmentMode: boolean;
}

export type MahameruConfigCallback = (context: MahameruConfigHandlerContext) => Partial<MahameruConfig> | Promise<Partial<MahameruConfig>>;

/**
 * Handler function type for managing MahameruJS configuration.
 * 
 * This type defines a wrapper function that accepts a user callback. The callback
 * receives a context object and generates a merged configuration by overlaying user 
 * preferences onto the framework's default settings.
 *
 * @callback MahameruConfigCallback
 * @param {MahameruConfigHandlerContext} context - The framework context containing defaults and environment state.
 * @returns {Partial<MahameruConfig> | Promise<Partial<MahameruConfig>>} A partial configuration object or a Promise resolving to one.
 *
 * @typedef {function} MahameruConfigHandler
 * @param {MahameruConfigCallback} callback - The user-defined configuration factory function.
 * @returns {MahameruConfig | Promise<MahameruConfig>} The fully instantiated configuration object or a Promise resolving to one.
 */
export type MahameruConfigHandler = (
    callback: (context: MahameruConfigHandlerContext) =>
        Partial<MahameruConfig> | Promise<Partial<MahameruConfig>>
) => MahameruConfigResult | Promise<MahameruConfigResult>;

export type MahameruConfigResult = {
    merged: MahameruConfig
    partial?: Partial<MahameruConfig>;
};

/**
 * Initializes and resolves the application configuration for MahameruJS.
 * 
 * This utility high-order function injects standard defaults and environment context 
 * via a single context argument into your custom callback. It handles both synchronous 
 * blocks and asynchronous Promises smoothly, ensuring all omitted keys fallback safely.
 *
 * @example
 * // 1. Synchronous Example (with Object Destructuring)
 * export default mahameruConfig(({ isDevelopmentMode }) => {
 *   return {
 *     port: isDevelopmentMode ? 3000 : 80,
 *     debug: isDevelopmentMode
 *   };
 * });
 *
 * @example
 * // 2. Asynchronous Example (fetching secrets or remote config)
 * export default mahameruConfig(async (context) => {
 *   const remotePort = await fetchVaultPort();
 * 
 *   return {
 *     port: remotePort,
 *     allowedHosts: context.isDevelopmentMode ? '*' : ['domain.com']
 *   };
 * });
 * 
 * @param {MahameruConfigCallback} callback - A factory function that returns your custom partial settings.
 * @returns {MahameruConfigResult | Promise<MahameruConfigResult>} The final merged configuration object containing all required fields.
 */
export const mahameruConfig: MahameruConfigHandler = (callback) => {
    const result = callback({
        isDevelopmentMode: process.env.MAHAMERU__DEV === 'true'
    });

    if (result instanceof Promise)
        return result.then(config => ({
            merged: {
                ...mahameruDefaultConfig,
                ...config
            },
            partial: config
        }));

    return {
        merged: {
            ...mahameruDefaultConfig,
            ...result
        },
        partial: result
    };
};

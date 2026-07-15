import Diatrema, { type DiatremaEvents } from '@mahameru/diatrema';
import diatremaDependencies from './dependencies-builder';
import { mahameruDefaultConfig, type MahameruConfig } from './config';

type MahameruExtendedConfig = MahameruConfig & {
    /**
     * Development mode
     */
    dev: boolean
}

export const mahameru = (config: Partial<MahameruExtendedConfig>) => {
    if (typeof config.dev === 'undefined')
        config.dev = false

    config.debug = config.dev;

    const mahameruConfig = {
        ...mahameruDefaultConfig,
        ...config
    }

    const app = new Diatrema(
        {
            dev: config.dev,
            isStandalone: true,
        },
        diatremaDependencies({
            mahameruConfig,
            dev: config.dev
        })
    );

    const handleOnReady = async ({ mode, host, port }: DiatremaEvents['ready']['0']) => {
        console.log(`[Mahameru Server] Server ready. Mode: ${mode}, Host: ${host}, Port: ${port}`);
        // printServerReady({ mode, host, port });
    }

    const handleGracefulShutdown = async (signal: NodeJS.Signals) => {
        if (app.isShuttingDown)
            return;

        console.log(`[Mahameru Server] Received ${signal} signal. Graceful Shutting down...`);

        try {
            await app.shutdown();
            console.log(`[Mahameru Server] Graceful Shutting down... Done`);
        } catch (error) {
            console.error('[Mahameru Server] Error during shutdown:', error);
        } finally {
            process.exit(0);
        }
    }

    app.on('ready', handleOnReady);

    process.on('SIGINT', handleGracefulShutdown);
    process.on('SIGTERM', handleGracefulShutdown);

    return {
        /**
         * Indicates whether the Mahameru server has been initialized or not.
         */
        initialized: app.initialized,
        /**
         * Indicates whether the Mahameru server is shutting down or not.
         */
        isShuttingDown: app.isShuttingDown,
        /**
         * Indicates whether the Mahameru server is running in standalone mode or not.
         */
        isStandalone: app.options.isStandalone,
        /**
         * Initialize the Mahameru Server
         */
        initialize: async () => {
            await app.initialize();
        },
        /**
         * Shut down the server gracefully
         */
        close: async () => {
            console.log(`[Mahameru Server] Graceful Shutting down...`);
            await app.shutdown();
            console.log(`[Mahameru Server] Graceful Shutting down... Done`);
        },
        /**
         * Override the default ready handler
         */
        onReady: (callback: ({ mode, host, port }: DiatremaEvents['ready']['0']) => void | Promise<void>) => {
            app.removeAllListeners('ready');
            app.on('ready', callback);
        },
        /**
         * Override the default SIGINT handler
         */
        onSIGINT: (callback: (signal: NodeJS.Signals) => void | Promise<void>) => {
            process.removeAllListeners('SIGINT');
            process.on('SIGINT', callback);
        },
        /**
         * Override the default SIGTERM handler
         */
        onSIGTERM: (callback: (signal: NodeJS.Signals) => void | Promise<void>) => {
            process.removeAllListeners('SIGTERM');
            process.on('SIGTERM', callback);
        }
    };
}

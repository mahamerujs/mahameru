import Diatrema from "@mahameru/diatrema";
import type { MahameruIPCMessageChild } from "../../types";
import { printServerReady } from "../../utils/printServerReady";
import { isPortAvailable } from "../../utils/free-port-finder";
import { loadConfig } from "../../utils/load-config";
import { join } from "node:path";
import MahameruError from "../../mahameru-error";

export default function start({ rootPath, version }: { rootPath: string; version: string }) {
    return async ({ host, port }: { host: string; port: number }) => {
        try {
            const mahameruConfigFilePath = join(rootPath, '.mahameru', 'mahameru.config.js');
            const mahameruConfig = await loadConfig(mahameruConfigFilePath);

            if (host) {
                mahameruConfig.merged.host = host;
            } else {
                host = mahameruConfig.merged.host;
            }

            if (port) {
                mahameruConfig.merged.port = port;
            } else {
                port = mahameruConfig.merged.port;
            }

            if (!(await isPortAvailable(port)))
                throw new MahameruError(`Port ${port} is already in use`);

            const app = new Diatrema({
                rootPath,
                dev: false
            });

            app.on('ready', ({ port, host, mode }) => {
                printServerReady({ mode, host, port, version });
            });

            await app.initialize();

            process.on('message', async (message: MahameruIPCMessageChild) => {
                if (!process.send || app.isShuttingDown)
                    return;

                switch (message.type) {
                    case 'SHUTDOWN':
                        await app.shutdown();
                        console.log(`[Worker ${process.pid}] Graceful Shutting down... Done`);

                        process.exit(0);
                }
            });
        } catch (error) {
            if (error instanceof MahameruError) {
                console.error(error);

                process.exit(1);
            }

            console.error(error);
        }
    }
}

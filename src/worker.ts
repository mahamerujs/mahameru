import Diatrema from "@mahameru/diatrema";
import diatremaDependencies from "./dependencies-builder";
import type { MahameruIPCMessageChild, MahameruIPCMessageServer } from "./types";
import { loadConfig } from "./utils/load-config";
import { join } from "node:path";

type WorkerOptions = { rootPath: string; dev: boolean; host?: string; port?: number; };

export default async function worker({ rootPath, dev, host, port }: WorkerOptions) {
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

        const app = new Diatrema(
            {
                rootPath,
                dev
            },
            diatremaDependencies({
                dev,
                mahameruConfig: mahameruConfig.merged
            })
        );

        app.on('ready', ({ port, host }) => {
            if (!process.send)
                return;

            console.log(`[Worker ${process.pid}] Ready on ${host}:${port}`);

            process.send({
                type: 'READY',
                data: {
                    pid: process.pid,
                    host,
                    port
                }
            } as MahameruIPCMessageServer);
        });

        await app.initialize();

        process.on('message', async (message: MahameruIPCMessageChild) => {
            if (!process.send || app.isShuttingDown)
                return;

            switch (message.type) {
                case 'DEV_HRM':
                    await app.devHRM(message.data.changedFile);
                    break;

                case 'RESTART':
                    console.log(`[Worker ${process.pid}] Restarting server...`);
                    await app.shutdown();
                    await app.initialize();
                    console.log(`[Worker ${process.pid}] Restarting server... Done`);
                    break;

                case 'SHUTDOWN':
                    await app.shutdown();
                    console.log(`[Worker ${process.pid}] Graceful Shutting down... Done`);

                    process.exit(0);

                    break;

                default:
                    process.send({
                        type: 'ERROR',
                        data: { message: `Unknown message type: ${(message as any).type}` }
                    } as MahameruIPCMessageServer);
                    break;
            }
        });
    } catch (error) {
        console.error(error);
    }
};

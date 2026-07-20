import { Mahameru } from "../../mahameru";

let version = '0.0.0';

export default function devTest({ rootPath, version: originalVersion }: { rootPath: string; version: string }) {
    version = originalVersion;

    return async ({ }: { host: string; port: number }) => {
        try {
            let isShuttingDown = false;
            const mahameru = new Mahameru({
                rootPath,
                dev: true,
                debug: true,
                moduleType: 'esm'
            })

            const shutdown = async (_signal: NodeJS.Signals) => {
                if (isShuttingDown)
                    return;

                isShuttingDown = true;

                await mahameru.shutdown();

                process.exit(0);
            }

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

            await mahameru.start();
        } catch (error) {
            console.error(error);
        }
    }
}

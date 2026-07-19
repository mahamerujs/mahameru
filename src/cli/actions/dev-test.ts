import { Mahameru } from "../../mahameru";

let version = '0.0.0';

export default function devTest({ rootPath, version: originalVersion }: { rootPath: string; version: string }) {
    version = originalVersion;

    return async ({ }: { host: string; port: number }) => {
        try {
            const mahameru = new Mahameru({
                rootPath,
                dev: true,
                debug: true,
                moduleType: 'esm'
            })

            await mahameru.start();

            const shutdown = async (_signal: NodeJS.Signals) => {
                await mahameru.shutdown();

                process.exit(0);
            }

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        } catch (error) {
            console.error(error);

            process.exit(1);
        }
    }
}

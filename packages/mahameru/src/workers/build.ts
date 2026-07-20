import { MahameruDevServer } from "../server/mahameru-dev-server";
import { devEnvironmentCheck } from "../utils/dev-environment-check";

(async () => {
    try {
        if (!process.send) {
            console.error('This script can only be run in a child process.');

            process.exit(1);
        }

        const rootPath = process.env.MAHAMERU__ROOT_PATH;
        const productionDirPath = process.env.MAHAMERU__PRODUCTION_DIR_PATH;

        if (!rootPath)
            throw new Error('MAHAMERU__ROOT_PATH environment variable is not set.');

        if (!productionDirPath)
            throw new Error('MAHAMERU__PRODUCTION_DIR_PATH environment variable is not set.');

        const server = new MahameruDevServer({
            rootPath,
            productionDirPath
        });

        devEnvironmentCheck(rootPath);

        await server.generator.start();
        await server.build();

        process.exit(0);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(error);
        }

        process.exit(1);
    }
})()

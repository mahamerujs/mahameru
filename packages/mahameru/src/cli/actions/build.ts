import { join } from "node:path";
import pc from "picocolors";
import { diatremaDefaultConfig } from "@mahameru/diatrema";
import { rm } from "node:fs/promises";
import { formatTypescriptError } from "../../utils/format-typescript-error";
import { printCliBanner } from "../../utils/printCliBanner";
import { devEnvironmentCheck } from "../../utils/dev-environment-check";
import ora from "ora";
import { buildScript } from "../scripts/build";

export default function build({ rootPath, version }: { rootPath: string; version: string }) {
    return async () => {
        printCliBanner(version);

        const spinner = ora({
            spinner: 'aesthetic',
            text: ` Building project...\n\n${pc.yellow('Hold tight! We are building your project.\nGrab your beers and relax 🍻')}\n\n`
        }).start();

        try {
            devEnvironmentCheck(rootPath);

            const { productionDir } = diatremaDefaultConfig;
            const productionDirPath = join(rootPath, productionDir);
            await rm(productionDirPath, { recursive: true, force: true });

            const { errors } = await buildScript({ rootPath, productionDirPath });

            if (errors.length > 0) {
                await rm(productionDirPath, { recursive: true, force: true });

                spinner.fail(pc.red('Build failed'));

                console.log(`\n${formatTypescriptError(errors)}`);

                process.exit(1);
            }

            spinner.succeed(pc.green('Build completed'));

            process.exit(0);
        } catch (error) {
            if (error instanceof Error) {
                spinner.fail(error.message);
            } else {
                spinner.fail(pc.red('Build failed.'));
                console.error(error);
            }

            process.exit(1);
        }
    }
}

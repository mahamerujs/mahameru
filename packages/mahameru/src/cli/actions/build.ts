import { join } from 'node:path';
import pc from 'picocolors';
import { diatremaDefaultConfig } from '@mahameru/diatrema';
import { rm } from 'node:fs/promises';
import { printCliBanner } from '../../utils/printCliBanner.js';
import { devEnvironmentCheck } from '../../utils/dev-environment-check.js';
import ora from 'ora';
import { Mahameru } from '../../mahameru.js';

export default function build({ rootPath, version }: { rootPath: string; version: string }) {
  return async () => {
    printCliBanner(version);

    const spinner = ora({
      spinner: 'aesthetic',
      text: ` Building project...\n\n${pc.yellow('Hold tight! We are building your project.\nGrab your beers and relax 🍻')}\n\n`,
    }).start();

    try {
      devEnvironmentCheck(rootPath);

      const { productionDir } = diatremaDefaultConfig;
      const productionDirPath = join(rootPath, productionDir);
      await rm(productionDirPath, { recursive: true, force: true });
      let isShuttingDown = false;
      const mahameru = new Mahameru({
        rootPath,
        dev: true,
        debug: true,
      });

      const shutdown = async (_signal: NodeJS.Signals) => {
        if (isShuttingDown) return;

        isShuttingDown = true;

        await mahameru.shutdown();

        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await mahameru.build();

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
  };
}

import { join } from 'node:path';
import TypescriptServer, { type TypescriptServerEvents } from '../server/typescript-server.js';
import { devEnvironmentCheck } from '../utils/dev-environment-check.js';
import { createLogger } from '@mahameru/tephra';

const logger = createLogger(['TypescriptServer', 'Worker', 'Build'], true);

function sendMessage(message: Partial<TypescriptServerEvents>) {
  return new Promise<true>((resolve, reject) => {
    if (!process.send) {
      reject(new Error('Cannot send message. This script can only be run in a child process.'));

      return;
    }

    process.send(message, (error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(true);

      return;
    });
  });
}

(async () => {
  try {
    if (!process.send) {
      console.error('This script can only be run in a child process.');

      process.exit(1);
    }

    const rootPath = process.env.MAHAMERU__ROOT_PATH;
    const productionDirPath = process.env.MAHAMERU__PRODUCTION_DIR_PATH;

    if (!rootPath) throw new Error('MAHAMERU__ROOT_PATH environment variable is not set.');

    if (!productionDirPath)
      throw new Error('MAHAMERU__PRODUCTION_DIR_PATH environment variable is not set.');

    devEnvironmentCheck(rootPath);

    const typescriptServer = new TypescriptServer({
      debug: true,
      developmentDirPath: productionDirPath,
      rootPath,
      tsConfigDevFilePath: join(rootPath, 'tsconfig.dev.json'),
      sourceDirPath: join(rootPath, 'src'),
      tsConfigFilePath: join(rootPath, 'tsconfig.json'),
    });

    typescriptServer.on('status-update', async (status) => {
      logger.debug(status);
      await sendMessage({ 'status-update': [status] });

      if (typescriptServer.errors.length > 0)
        await sendMessage({
          'compile-error': [typescriptServer.errors],
        });
    });

    await typescriptServer.build();

    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
})();

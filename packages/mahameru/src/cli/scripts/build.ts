import { fork } from 'node:child_process';
import { join, resolve } from 'node:path';

import type { TsErrorReport } from '../../server/mahameru-dev-server';

export const buildScript = async ({
  rootPath,
  productionDirPath,
}: {
  rootPath: string;
  productionDirPath: string;
}) => {
  const workerPath = resolve(join(__dirname, '..', '..', 'workers', 'build.js'));

  return await new Promise<{ errors: TsErrorReport[] }>((resolve, reject) => {
    const worker = fork(workerPath, {
      env: {
        MAHAMERU__ROOT_PATH: rootPath,
        MAHAMERU__PRODUCTION_DIR_PATH: productionDirPath,
      },
      stdio: 'inherit',
    });

    const errors: TsErrorReport[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.on('message', ({ type, data }: any) => {
      if (type === 'ERROR' && data) {
        errors.push(...(data as TsErrorReport[]));
      }
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject('Build failed.');

        return;
      }

      resolve({ errors });
    });
  });
};

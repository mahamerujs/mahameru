import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { devEnvironmentCheck } from '../../utils/dev-environment-check';
import ora from 'ora';
import { ChildProcess, spawn } from 'node:child_process';
// import { fileURLToPath } from "node:url";
// import { printServerReadyString } from "../../utils/printServerReady";
// import cli from "../../utils/cli";
import type { TypescriptServerParentToChildMessage } from '../../workers/typescript-server';
// import type { DevServerChildProcessMessage, DevServerParentProcessMessage, DevServerStatus } from "../../workers/dev-server";
// import pc from 'picocolors';
// import { MAHAMERU_TITLE } from "../../constants";
import type {
  TypescriptServerEvents,
  TypescriptServerStatus,
} from '../../server/typescript-server';
import { createLogger } from '@mahameru/diatrema';

// const __dirname = dirname(fileURLToPath(import.meta.url));
// let appState: { port: number; host: string; mode: 'development' | 'production' } | null = null;
const logger = createLogger('Mahameru', true);

export default function dev({ rootPath }: { rootPath: string; version: string }) {
  return async (_: { host: string; port: number }) => {
    let shuttingDown = false;
    const shutdownTimeout = 3000;

    try {
      devEnvironmentCheck(rootPath);

      // cli.clearScreen();

      const spinner = ora('Starting server...').start();
      // screenUpdate(undefined, spinner, true);

      await rm(join(rootPath, '.mahameru'), { recursive: true, force: true });

      spinner.text = 'Starting...';

      let errors: string | undefined = undefined;
      // let devServerInstance: ReturnTypeDevServer;

      const { child: typeCheckingWatcherProcess, start: startTypeCheckingWatcher } =
        await typeCheckingWatcher(rootPath, (message) => {
          if (message['compile-error']) {
            errors =
              message['compile-error'][0].length > 0
                ? message['compile-error'][0].map((m) => m.formatted).join('\n\n')
                : undefined;
            if (typeof errors !== 'undefined') logger.error(errors);
            // if (!appState) return;

            if (errors) {
              // screenUpdate([message.error]);
              logger.error(errors);
            } else {
              // screenUpdate(undefined);
            }
          } else if (message['status-update']) {
            const status = message['status-update'][0];

            if (spinner.isSpinning) {
              if (status === 'GENERATING-TYPES') {
                spinner.text = 'Generating types...';
              } else if (status === 'STARTING') {
                spinner.text = 'Starting Typescript server...';
              } else if (status === 'READY') {
                spinner.text = 'Typescript server ready!';
              }
            }
          } else if (message['file-changed']) {
            const [filePath, eventType, itemType] = message['file-changed'];
            // if (devServerInstance) {
            //     if (message.eventType === 'update')
            //         devServerInstance.sendMessage({ type: 'FILE_CHANGED', filePath: message.filePath, eventType: message.eventType });
            // }
            logger.info('[TypescriptServer]', filePath, eventType, itemType);
          }
        });

      spinner.text = 'Starting type checking watcher...';
      await startTypeCheckingWatcher();

      // devServerInstance = await devServer(rootPath, (message) => {
      //     if (message.type === "MESSAGE") {
      //         spinner.text = message.data;
      //     }
      // }, version, host, port);

      // spinner.text = 'Starting Mahameru Dev Server...';

      // const data = await devServerInstance.start();

      spinner.stop();

      // appState = {
      //     port: data.port,
      //     host: data.host,
      //     mode: data.mode
      // }

      logger.info('Ready!');

      // screenUpdate(errors ? errors : undefined, undefined);

      const shutdown = async (signal?: NodeJS.Signals) => {
        // cli.cursor.show();

        if (shuttingDown) {
          logger.info(`Please wait, we are trying to shutdown gracefully.`);

          return;
        }

        const spinner = ora(
          `${signal ? `Received ${signal} ` : ''}signal. Shutting down...`,
        ).start();

        shuttingDown = true;

        spinner.text = 'Shutting down Typescript Server...';
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            spinner.text = 'Watcher process took too long to shutdown. Forcing kill...';
            typeCheckingWatcherProcess.kill('SIGKILL');
            resolve(false);
          }, shutdownTimeout);

          typeCheckingWatcherProcess.on('exit', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          if (typeCheckingWatcherProcess.connected) {
            typeCheckingWatcherProcess.send({ type: 'SHUTDOWN' });
          } else {
            typeCheckingWatcherProcess.kill('SIGINT');
          }
        });

        spinner.text = 'Shutting down Mahameru Dev Server...';
        // await new Promise(resolve => {
        //     const timeout = setTimeout(() => {
        //         console.warn("Dev server took too long to shutdown. Forcing kill...");
        //         spinner.text = 'Dev server took too long to shutdown. Forcing kill...';
        //         devServerInstance.child.kill('SIGKILL');
        //         resolve(false);
        //     }, shutdownTimeout);

        //     devServerInstance.child.on('exit', () => {
        //         clearTimeout(timeout);
        //         resolve(true);
        //     });

        //     if (devServerInstance.child.connected) {
        //         devServerInstance.sendMessage({ type: 'SHUTDOWN' });
        //     } else {
        //         devServerInstance.child.kill('SIGINT');
        //     }
        // });

        spinner.succeed('Shutdown complete.');

        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(error);
      }

      process.exit(1);
    }
  };
}

const typeCheckingWatcher = async (
  rootPath: string,
  handleOnMessage: (message: Partial<TypescriptServerEvents>) => void = () => {},
) => {
  let status: TypescriptServerStatus = 'STOPPED';

  const child = await new Promise<ChildProcess>((resolve) => {
    const workerFilePath = join(
      rootPath,
      'node_modules',
      'mahameru',
      'workers',
      'typescript-server.js',
    );
    const child = spawn(process.execPath, [workerFilePath], {
      cwd: rootPath,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        MAHAMERU__ROOT_PATH: rootPath,
      },
    });

    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('message', (message: Partial<TypescriptServerEvents>) => {
      handleOnMessage(message);

      if (message['status-update']) {
        status = message['status-update'][0];

        if (status === 'WORKER:STARTED') {
          resolve(child);
        }
      }
    });
  });

  const sendMessage = (message: TypescriptServerParentToChildMessage) =>
    new Promise<true>((resolve, reject) => {
      child.send(message, (error) => (error ? reject(error) : resolve(true)));
    });

  return {
    status,
    sendMessage,
    start: () =>
      new Promise((resolve) => {
        const handleOnStarted = (message: Partial<TypescriptServerEvents>) => {
          if (message['status-update'] && message['status-update'][0] === 'READY') {
            child.off('message', handleOnStarted);

            resolve(true);
          }
        };

        child.on('message', handleOnStarted);

        sendMessage({ type: 'START' });
      }),
    child,
  };
};

// type ReturnTypeDevServer = {
//     status: "STOPPED";
//     child: ChildProcess;
//     sendMessage: (message: DevServerParentProcessMessage) => Promise<true>;
//     start: () => Promise<{
//         port?: number;
//         host?: string;
//         mode: "development" | "production";
//     }>;
// };

// const devServer = async (rootPath: string, handleOnMessage: (message: DevServerChildProcessMessage) => void, _version: string, host: string, port: number): Promise<ReturnTypeDevServer> => {
//     let status: DevServerStatus = 'STOPPED';
//     const child = await new Promise<ChildProcess>(resolve => {
//         const devServerPath = join(__dirname, '..', '..', 'workers', 'dev-server.js');
//         const child = spawn(process.execPath, [
//             devServerPath
//         ], {
//             cwd: rootPath,
//             stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
//             env: {
//                 ...process.env,
//                 MAHAMERU__DEV: 'true',
//                 MAHAMERU__ROOT_PATH: rootPath,
//                 MAHAMERU__HTTP_LISTEN_HOST: host,
//                 MAHAMERU__HTTP_LISTEN_PORT: String(port)
//             }
//         });

//         child.stdout?.on('data', (data) => {
//             process.stdout.write(data);
//         });

//         child.stderr?.on('data', (data) => {
//             process.stderr.write(data);
//         });

//         child.on('message', (message: DevServerChildProcessMessage) => {
//             handleOnMessage(message);

//             if (message.type === 'STATUS') {
//                 status = message.data;

//                 if (status === 'RUNNING') {
//                     resolve(child);
//                 }
//             }
//         });
//     });

//     const sendMessage = (message: DevServerParentProcessMessage) => new Promise<true>((resolve, reject) => {
//         child.send(message, (error) => error ? reject(error) : resolve(true));
//     });

//     return {
//         status,
//         child,
//         sendMessage,
//         start: () => new Promise(resolve => {
//             const handleOnStarted = (message: DevServerChildProcessMessage) => {
//                 if (message.type === 'READY') {
//                     child.off('message', handleOnStarted);

//                     resolve(message.data);
//                 }
//             }

//             child.on('message', handleOnStarted);

//             sendMessage({ type: 'START' });
//         })
//     };
// }

// function screenUpdate(body: string | string[] | undefined, spinner?: Ora, showHeader: boolean = false) {
//     const header = `${pc.bold(MAHAMERU_TITLE)} ${pc.dim(`v${version}`)}`;
//     const content: string[] = []

//     if (appState)
//         content.push(...[printServerReadyString({ mode: appState.mode, host: appState.host, port: appState.port, version }), '']);

//     if (body)
//         if (Array.isArray(body)) {
//             content.push(...body);
//         } else {
//             content.push(body);
//         }

//     cli.cursor.hide();
//     cli.updateScreen(showHeader ? header : undefined, content, spinner);
// }

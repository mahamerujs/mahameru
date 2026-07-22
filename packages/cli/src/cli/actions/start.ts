import { StrictServerOptions } from './scripts/types';
import { App, type AppInstanceOptions } from './scripts/app';
import { printCliBanner } from './scripts/printCliBanner';
import { printServerReady } from './scripts/printServerReady';
import pc from 'picocolors';

export function start({ rootPath, version }: { rootPath: string; version: string }) {
  return async ({ host, port, multiCore }: StrictServerOptions & { multiCore?: number }) => {
    let isShuttingDown = false;

    printCliBanner(version);

    const appOptions: Partial<AppInstanceOptions> = {
      dev: false,
      host,
      port,
      rootPath,
      multiCore,
    };

    const app = new App(appOptions);

    app.onMessage = (message) => {
      switch (message.type) {
        case 'READY':
          printServerReady({
            dev: false,
            mode: 'production',
            host: message.data.host,
            port: message.data.port,
          });
          break;

        case 'ERROR':
          console.error(
            pc.red(`\n[Mahameru]`),
            message.data.message,
            message.data.stack ?? '',
            message.data.code ?? '',
          );
          break;

        case 'LOG':
          console.log(message.data);
          break;

        default:
          // console.log(`[Mahameru] Unknown IPC message type: ${(message as any).type}`);
          break;
      }
    };

    await app.start();

    const shutdown = async (signal: NodeJS.Signals) => {
      if (isShuttingDown) return;

      isShuttingDown = true;

      await app.stop();

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  };
}

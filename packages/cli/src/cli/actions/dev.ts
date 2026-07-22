import { freePortFinder } from '@/utils/free-port-finder';
import { ensureDevEnvironment } from './scripts/ensureDevEnvironment';
import { printCliBanner } from './scripts/printCliBanner';
import { startWatchedDevServer } from './scripts/startWatchedDevServer';
import { StrictServerOptions } from './scripts/types';

export function dev({ version }: { version: string }) {
  return async ({ host, port }: StrictServerOptions) => {
    console.clear();
    const environment = ensureDevEnvironment();

    printCliBanner(version);

    port = await freePortFinder(port);

    await startWatchedDevServer({
      version,
      environment,
      host: host,
      port: port,
    });
  };
}

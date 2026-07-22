import type { StrictServerOptions } from './scripts/types';
import { processManager } from '../../mpm';
import { generatePmConfig } from '@/utils/generate-pm-config';

export const pm =
  (version: string) =>
  async ({
    host,
    port,
    daemon,
    cert,
    key,
  }: StrictServerOptions & { daemon: boolean; cert?: string; key?: string }) => {
    const pmConfig = await generatePmConfig({ host, port, cert, key });

    await processManager({ ...pmConfig, daemon }, version);
  };

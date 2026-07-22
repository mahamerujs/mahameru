import { createLogger } from '@mahameru/diatrema';

const logger = createLogger('Mahameru', true);

export default function stop({ rootPath, version }: { rootPath: string; version: string }) {
  return async ({ host, port }: { host: string; port: number }) => {
    logger.info('MahameruJS STOP v', version);
    logger.info('rootPath:', rootPath);
    logger.info('Mode:', 'production');
    logger.info('Host:', host);
    logger.info('Port:', port);
  };
}

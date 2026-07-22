import { createLogger } from '@mahameru/diatrema';

const logger = createLogger('Mahameru', true);

export default function status({ rootPath, version }: { rootPath: string; version: string }) {
  return async ({ host, port }: { host: string; port: number }) => {
    logger.info('MahameruJS STATUS v', version);
    logger.info('rootPath:', rootPath);
    logger.info('Mode:', 'production');
    logger.info('Host:', host);
    logger.info('Port:', port);
  };
}

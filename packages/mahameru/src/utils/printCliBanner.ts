import pc from 'picocolors';
import { MAHAMERU_TITLE } from '../constants';

export function printCliBanner(version: string) {
  // eslint-disable-next-line no-console
  console.log(`${pc.bold(MAHAMERU_TITLE)} ${pc.dim(`v${version}`)}\n`);
}

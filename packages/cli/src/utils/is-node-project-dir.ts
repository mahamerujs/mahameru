import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function isNodeProjectDir(rootPath: string) {
  try {
    return existsSync(join(process.cwd(), 'package.json'));
  } catch {
    return false;
  }
}

import { chown, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function chownR(targetPath: string, uid: number, gid: number) {
  await chown(targetPath, uid, gid);

  const stats = await lstat(targetPath);

  if (stats.isDirectory()) {
    const items = await readdir(targetPath);

    await Promise.all(items.map((item) => chownR(join(targetPath, item), uid, gid)));
  }
}

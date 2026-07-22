import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function findUnresolvedAliases(directoryPath: string) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const pending = [directoryPath];
  const unresolved = new Set<string>();

  while (pending.length > 0) {
    const currentPath = pending.pop()!;

    for (const entry of readdirSync(currentPath)) {
      const entryPath = join(currentPath, entry);
      const entryStat = statSync(entryPath);

      if (entryStat.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (!entryPath.endsWith('.js')) {
        continue;
      }

      const fileContent = readFileSync(entryPath, 'utf8');

      if (fileContent.includes("'@/") || fileContent.includes('"@/')) {
        unresolved.add(entryPath);
      }
    }
  }

  return [...unresolved];
}

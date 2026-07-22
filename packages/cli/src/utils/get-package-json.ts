import { Payload } from '../types';
import { PackageJson } from '../cli/actions/scripts/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function getProjectJson(path: string) {
  try {
    const packageJson = JSON.parse(
      await readFile(join(path, 'package.json'), 'utf-8'),
    ) as PackageJson;
    if (!packageJson.name) throw new Error('package name cannot be empty');

    if (!packageJson.version) throw new Error('package version cannot be empty');

    return packageJson as Payload['packageJson'];
  } catch (error) {
    throw new Error('package.json not found');
  }
}

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export function loadEnvironmentVariables(dev: boolean) {
  const defaultEnvFilePath = join(process.cwd(), '.env');
  const envFilePath = join(process.cwd(), `.env.${dev ? 'development' : 'production'}`);
  const envLocalFilePath = join(process.cwd(), '.env.local');

  const filesToLoad = [defaultEnvFilePath, envFilePath, envLocalFilePath];

  const envForProcess: Record<string, string> = {};
  const envForMahameru: Record<string, string> = {};

  for (const filePath of filesToLoad) {
    if (existsSync(filePath)) {
      try {
        if (process.send)
          process.send({ type: 'MESSAGE', data: `Loading environment variables from ${filePath}` });

        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const equalIndex = trimmed.indexOf('=');
          if (equalIndex === -1) continue;

          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();

          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          envForProcess[key] = value;

          if (key.startsWith('MAHAMERU__')) {
            const cleanKey = key.replace(/^MAHAMERU__/, '');
            envForMahameru[cleanKey] = value;
          }
        }
      } catch (error) {
        console.error(`Failed to read ${filePath}:`, error);
      }
    }
  }

  if (Object.keys(envForProcess).length === 0) return;

  Object.assign(process.env, envForProcess);

  globalThis.mahameruEnv = {
    ...globalThis.mahameruEnv,
    ...envForMahameru,
  };
}

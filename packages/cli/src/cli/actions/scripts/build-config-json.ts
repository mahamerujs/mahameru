import { createRequire } from 'module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function buildConfigJson() {
    const customRequire = createRequire(__filename);
    const { mahameruDefaultConfig } = customRequire(join(process.cwd(), 'node_modules', 'mahameru', 'dist', 'mahameru.js'));
    const tsModule = customRequire(join(process.cwd(), 'mahameru.config.ts'));
    const configFunction = tsModule.default;

    const result = await configFunction(mahameruDefaultConfig);
    const configJson = JSON.stringify(result);
    const outputPath = join(process.cwd(), '.mahameru', '.mahameru.config.json');

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, configJson, 'utf-8');

    return configFunction
}

import { pathToFileURL } from 'node:url';
import mahameru, { type MahameruConfig, MahameruError } from '../../index.js';
import path from 'node:path';

export default async function onDev(cliOptions: { port: string }) {
    try {
        console.log('\x1b[36m%s\x1b[0m', '▲ Mahameru - Starting development server...');

        const root = process.cwd();
        const configPath = pathToFileURL(path.join(root, 'mahameru.config.ts')).href;
        const module = await import(configPath);

        if (!module.default)
            throw new MahameruError('Mahameru config not found')

        const mahameruConfig = module.default as MahameruConfig;
        const app = mahameru(mahameruConfig);

        await app.initialize()
    } catch (error) {
        console.error(error)
    }
}

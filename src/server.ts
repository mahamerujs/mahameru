import pc from 'picocolors';
import { Mahameru, mahameruDefaultConfig, mahameruDefaultBaseConfig, MahameruConfigFunction, MahameruConfig } from "./mahameru";
import { MahameruServerError } from './mahameru-server-error';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MahameruError } from './mahameru-error';
import { readFile } from 'node:fs/promises';

let app: Mahameru | null = null;
const runtimeRequire = createRequire(__filename);

(async () => {
    try {
        const env = ensureServerEnvironment()
        let configFilePath

        if (env.dev) {
            configFilePath = join(env.ROOT_PATH, mahameruDefaultBaseConfig.mahameruConfigFile);
        } else {
            configFilePath = join(env.ROOT_PATH, mahameruDefaultBaseConfig.productionDir, mahameruDefaultBaseConfig.productionConfigFile);
        }

        const config = await loadConfig(configFilePath);

        app = new Mahameru({
            dev: env.dev,
            port: env.port || config.port,
            host: env.host || config.host
        });

        await app.initialize();

        const shutdown = async (code?: number) => {
            if (process.send)
                return

            console.log(`Received ${code ? 'SIGINT' : 'SIGTERM'}`);

            try {
                await app?.close();
                process.exit(0);
            } catch (error) {
                console.error(error);

                process.exit(1);
            }
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        if (error instanceof MahameruServerError) {
            console.error(pc.red(error.message));
        } else {
            console.error(error);
        }

        if (app?.initialized)
            await app.close();

        process.exit(1);
    }
})()

function ensureServerEnvironment() {
    const dev = process.env.MAHAMERU__MODE?.trim() === 'development';
    const port = process.env.MAHAMERU__HTTP_LISTEN_PORT ? parseInt(process.env.MAHAMERU__HTTP_LISTEN_PORT.trim()) : undefined;
    const host = process.env.MAHAMERU__HTTP_LISTEN_HOST?.trim()
    const ROOT_PATH = process.env.MAHAMERU__ROOT_PATH?.trim()
    const CONFIG_FILE = process.env.MAHAMERU__CONFIG_FILE?.trim()

    if (!ROOT_PATH)
        throw new MahameruServerError('MAHAMERU__ROOT_PATH environment variable is not defined.');

    if (!CONFIG_FILE)
        throw new MahameruServerError('MAHAMERU__CONFIG_FILE environment variable is not defined.');

    let configFilePath: string | null = join(ROOT_PATH, CONFIG_FILE);
    const packageJsonPath = join(ROOT_PATH, 'package.json');

    if (!existsSync(packageJsonPath))
        throw new MahameruServerError('Current directory is not a Node.js project. Cannot find package.json file.');

    if (!existsSync(configFilePath))
        configFilePath = null;

    return {
        dev,
        port,
        host,
        ROOT_PATH,
        CONFIG_FILE,
        configFilePath
    }
}

function printServerReady({ dev, host, port }: { dev: boolean, host: string, port: number }) {
    console.log('\x1b[32m Mahameru Server Ready!\x1b[0m');
    console.log(`   \x1b[1mMode:\x1b[22m    \x1b[36m${dev ? 'Development' : 'Production'}\x1b[0m`);
    console.log(`   \x1b[1mLocal:\x1b[22m   \x1b[36mhttp://${host}:${port}\x1b[0m`);
    console.log(`   \x1b[1mHost:\x1b[22m    ${host}`);
    console.log(`   \x1b[1mPort:\x1b[22m    ${port}\n`);
    console.log('\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n');
}

async function loadConfig(configFilePath: string): Promise<Partial<MahameruConfig>> {
    let config: Partial<MahameruConfig>

    const resolvedPath = resolve(configFilePath);

    if (configFilePath.endsWith('.json')) {
        try {
            return await readFile(resolvedPath, 'utf-8') as Partial<MahameruConfig>;
        } catch (error) {
            throw new MahameruError(`Unable to load config file "${configFilePath}".`);
        }
    }

    const module = runtimeRequire(resolvedPath);

    if (!module.default)
        throw new MahameruServerError(`Config file "${configFilePath}" does not export a default export.`);

    const configFunction = module.default as MahameruConfigFunction;

    return await configFunction(mahameruDefaultConfig);
}

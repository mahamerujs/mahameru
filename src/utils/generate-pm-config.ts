import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { APPDATA_PATH, PM_CONFIG_FILE_PATH } from "../constants";
import { Login, LoginRole, type ProcessManagerConfig } from "../types/pm.config";
import { freePortFinder } from "./free-port-finder";
import { generateRandomStrings } from "./generate-random-string";
import { chownR } from "./chownr";
import { exists } from "./exists";

export type GeneratePmConfigOptions = {
    host: string;
    port: number;
    cert?: string | undefined;
    key?: string | undefined
}

export async function generatePmConfig({ host, port, cert, key }: GeneratePmConfigOptions): Promise<ProcessManagerConfig> {
    if (!(await directoryExists(APPDATA_PATH))) {
        await mkdir(APPDATA_PATH, { recursive: true });

        if (process.env.SUDO_UID && process.env.SUDO_GID)
            await chownR(APPDATA_PATH, Number(process.env.SUDO_UID!), Number(process.env.SUDO_GID!));
    }

    if (cert && !(await exists(cert)))
        throw new Error('SSL Certificate file not found');

    if (key && !(await exists(key)))
        throw new Error('SSL key file not found');

    let existingLogins: Login[] = [
        {
            username: 'admin',
            password: generateRandomStrings(8),
            role: 'admin'
        }
    ];

    const isFileExist = await exists(PM_CONFIG_FILE_PATH);

    if (isFileExist) {
        try {
            const configJson = await readFile(PM_CONFIG_FILE_PATH, 'utf-8');
            const pmConfig = JSON.parse(configJson) as ProcessManagerConfig;

            if (pmConfig && Array.isArray(pmConfig.logins)) {
                for (const login of pmConfig.logins)
                    if (login.role !== LoginRole.ADMIN && login.role !== LoginRole.USER)
                        throw new Error(`Invalid role ${login.role} for login ${login.username}`);

                existingLogins = pmConfig.logins;
            } else {
                throw new Error('Invalid configuration file structure: "logins" array is missing.');
            }
        } catch (error) {
            throw error;
        }
    }

    const finalConfig: ProcessManagerConfig = {
        host,
        port: await freePortFinder(port),
        cert,
        key,
        logins: existingLogins
    };

    await writeFile(PM_CONFIG_FILE_PATH, JSON.stringify(finalConfig, null, 2));

    if (process.env.SUDO_UID && process.env.SUDO_GID)
        await chownR(PM_CONFIG_FILE_PATH, Number(process.env.SUDO_UID!), Number(process.env.SUDO_GID!));

    return finalConfig;
}

async function directoryExists(dirPath: string) {
    try {
        const stats = await stat(dirPath);

        return stats.isDirectory();
    } catch (error) {
        if ((error as any).code === 'ENOENT')
            return false;

        throw error;
    }
}

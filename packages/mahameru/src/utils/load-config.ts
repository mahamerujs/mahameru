import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type MahameruConfigResult, mahameruDefaultConfig } from "../config";
import pc from "picocolors";
import { exists } from "../helpers";

/**
 * Loads the MahameruJS configuration file dynamically.
 * Falls back to default configuration if loading fails or file is missing.
 * 
 * @param {string} configPath - The relative or absolute path to the configuration file.
 * @returns {Promise<MahameruConfigResult>} The resolved configuration object.
 */
export async function loadConfig(configPath: string): Promise<MahameruConfigResult> {
    try {
        if (!(await exists(configPath))) {
            console.warn(pc.yellow('We cannot find mahameru.config.ts on root of your project. Falling back to default config.\n'));

            return {
                merged: mahameruDefaultConfig
            };
        }

        const url = pathToFileURL(configPath);
        const module = await import(url.href);

        if (module && module.default) {
            const configResult = module.default;

            if (configResult instanceof Promise) {
                return await configResult as MahameruConfigResult;
            }

            return configResult as MahameruConfigResult;
        }

        return {
            merged: mahameruDefaultConfig
        };
    } catch (error) {
        console.error(pc.red('Error loading mahameru.config.ts:'), error);
        console.warn(pc.yellow('Falling back to default config.'));

        return {
            merged: mahameruDefaultConfig
        };
    }
}

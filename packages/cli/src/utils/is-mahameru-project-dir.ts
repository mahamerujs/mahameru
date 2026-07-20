import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function isMahameruProjectDir(path: string) {
    const packageJsonPath = join(path, 'package.json');
    const nodeModulesPath = join(path, 'node_modules');

    if (!existsSync(packageJsonPath) && existsSync(nodeModulesPath))
        return false

    try {
        const packagesJsonString = readFileSync(packageJsonPath, 'utf-8');
        const packagesJson = JSON.parse(packagesJsonString) as { dependencies?: Record<string, string> };

        if (
            packagesJson.dependencies &&
            packagesJson.dependencies['mahameru']
        ) {
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

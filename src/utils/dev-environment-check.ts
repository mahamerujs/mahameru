import { join } from "node:path";
import { MAHAMERU_TITLE } from "../constants";
import pc from "picocolors";
import { existsSync } from "node:fs";

export function devEnvironmentCheck(rootPath: string) {
    const typescriptPath = join(rootPath, 'node_modules', 'typescript');
    const dependenciesNotFound: string[] = [];

    if (!existsSync(typescriptPath))
        dependenciesNotFound.push('typescript');

    if (dependenciesNotFound.length > 0) {
        let message = `Your current configuration is not compatible with the ${MAHAMERU_TITLE} development environment.\n\n`;
        message += `${pc.red('Missing dependencies:')} ${dependenciesNotFound.join(', ')}\n\n`;
        message += `Please install ${dependenciesNotFound.length > 1 ? 'them' : 'it'} by running:\n\n`;
        message += dependenciesNotFound.map(dependency => pc.yellow(`  npm install -D ${dependency}`)).join('\n');

        console.error(message);

        process.exit(1);
    }
}

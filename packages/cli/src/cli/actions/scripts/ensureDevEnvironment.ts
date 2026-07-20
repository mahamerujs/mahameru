import pc from 'picocolors'
import { DevEnvironment } from "./types";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { isMahameruProjectDir } from '@/utils/is-mahameru-project-dir';

export function ensureDevEnvironment(): DevEnvironment {
    const rootPath = process.cwd();
    const tsxJsPath = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const tscAliasJsPath = join(__dirname, 'node_modules', 'tsc-alias', 'dist', 'bin', 'index.js');
    const tscJsPath = join(rootPath, 'node_modules', 'typescript', 'bin', 'tsc');

    if (!isMahameruProjectDir(rootPath)) {
        console.error(pc.red('Current directory is not a MahameruJs project.'));

        process.exit(1);
    }

    if (!existsSync(tsxJsPath)) {
        console.error(pc.red(`Error: Runner 'tsx' is not installed.`));
        console.error(pc.yellow('Please install it by running: npm install -D tsx'));

        process.exit(1);
    }

    if (!existsSync(tscAliasJsPath)) {
        console.error(pc.red('Error: tsc-alias not installed.'));
        console.error(pc.yellow('Please install it by running: npm install -D tsc-alias'));

        process.exit(1);
    }

    if (!existsSync(tscJsPath)) {
        console.error(pc.red('Error: TypeScript compiler (tsc) is not installed in this project.'));
        console.error(pc.yellow('Please install it by running: npm install -D typescript'));

        process.exit(1);
    }

    return {
        rootPath,
        tsxJsPath,
        tscJsPath,
        tscAliasJsPath
    };
}

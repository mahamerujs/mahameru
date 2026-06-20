import { execSync } from "node:child_process";
import { renameSync } from "node:fs";
import path from "node:path";

export default async function onBuild() {
    console.log('\x1b[32m%s\x1b[0m', '▲ Mahameru - Compiling TypeScript with tsc...');

    try {
        const tscPath = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
        const tscAliasPath = path.join(process.cwd(), 'node_modules', 'tsc-alias', 'dist', 'bin', 'index.js');

        execSync(`node "${tscPath}" -p tsconfig.json && node "${tscAliasPath}" -p tsconfig.json`, {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        renameSync(path.join(process.cwd(), 'dist'), path.join(process.cwd(), '.mahameru'));

        console.log('\x1b[32m%s\x1b[0m', '✔ Build berhasil selesai.');
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '✖ Build gagal.');
        process.exit(1);
    }
}

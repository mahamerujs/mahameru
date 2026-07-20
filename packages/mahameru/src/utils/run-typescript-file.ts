import ts from 'typescript';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists } from '../helpers';

export interface RunTypescriptFileOptions {
    /**
     * Delete after transpiling.
     *
     * @default true
     */
    cleanup?: boolean;

    /**
     * Cache directory.
     *
     * @default ".mahameru/cache"
     */
    cacheDirectory?: string;
}

export async function runTypescriptFile<T>(filePath: string, options: RunTypescriptFileOptions = {}): Promise<T | undefined> {
    const {
        cleanup = true,
        cacheDirectory = join(process.cwd(), '.mahameru', 'cache'),
    } = options;

    if (!(await exists(filePath)))
        return;

    const source = await readFile(filePath, 'utf8');

    const { outputText, diagnostics } = ts.transpileModule(source, {
        fileName: filePath,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            esModuleInterop: true,
            sourceMap: false,
            inlineSourceMap: false,
            inlineSources: false,
        },
        reportDiagnostics: true,
    });

    if (diagnostics?.length) {
        const host: ts.FormatDiagnosticsHost = {
            getCanonicalFileName: fileName => fileName,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => '\n',
        };

        throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    }

    await mkdir(cacheDirectory, { recursive: true });

    const outputFile = join(cacheDirectory, 'config.mjs');

    await writeFile(outputFile, outputText, 'utf8');

    try {
        const module = await import(
            `${pathToFileURL(outputFile).href}?t=${Date.now()}`
        );

        return await module.default as T;
    } finally {
        if (cleanup) {
            await rm(outputFile, { force: true });
        }
    }
}

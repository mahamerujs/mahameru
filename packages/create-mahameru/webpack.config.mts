import path from 'path';
import webpack from 'webpack';
import pkg from './package.json' with { type: 'json' };
import TerserPlugin from 'terser-webpack-plugin';
import boxen from 'boxen';
import stripAnsi from 'strip-ansi';
import nodeExternal from 'webpack-node-externals';
import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createAsciiBox(title: string) {
    const content = [
        title,
        `Version: ${pkg.version}`,
        `Built: ${new Date().getFullYear()}`,
        '',
        `Copyright (c) Bintan <hello@bintvn.co>`,
        `Licensed under the ISC License.`
    ].join('\n');

    const boxed = boxen(content, {
        padding: 1,
        margin: 0,
        borderStyle: 'single',
        align: 'left'
    });

    const cleanBox = stripAnsi(boxed);
    const commentLines = cleanBox.split('\n').map(line => ` * ${line}`);

    return [
        '/*!',
        ...commentLines,
        ' */'
    ].join('\n');
}

const config: webpack.Configuration = {
    target: 'node',
    mode: 'production',
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        max_line_len: 120,
                        comments: /^!/
                    }
                }
            } as any),
        ],
    },
    externalsPresets: { node: true },
    externals: [
        nodeExternal({
            importType: 'commonjs',
            allowlist: [
                'commander',
                'ora',
                'picocolors',
                'inquirer',
                '@inquirer/ansi',
                '@inquirer/checkbox',
                '@inquirer/confirm',
                '@inquirer/core',
                '@inquirer/editor',
                '@inquirer/expand',
                '@inquirer/external-editor',
                '@inquirer/figures',
                '@inquirer/input',
                '@inquirer/number',
                '@inquirer/rawlist',
                '@inquirer/password',
                '@inquirer/prompts',
                '@inquirer/search',
                '@inquirer/select',
                'mute-stream',
                'signal-exit',
                'cli-width',
                'fast-wrap-ansi',
                'fast-string-width',
                'fast-string-truncated-width',
                'chardet',
                'iconv-lite',
                'safer-buffer',
                'run-async',
                'giget',
                'chalk',
                'cli-cursor',
                'restore-cursor',
                'onetime',
                'mimic-function',
                'cli-spinners',
                'log-symbols',
                'yoctocolors',
                'is-unicode-supported',
                'string-width',
                'strip-ansi',
                'ansi-regex',
                'get-east-asian-width',
                'is-interactive',
                'stdin-discarder'
            ]
        })
    ],
    module: {
        exprContextCritical: false,
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        extensionAlias: {
            '.js': ['.ts', '.js'],
        },
        plugins: [],
    },
    entry: './src/index.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'cli.js'
    },
    plugins: [
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
        }),
        new webpack.BannerPlugin({
            banner: `#!/usr/bin/env node\n${createAsciiBox('▲ MahameruJS - Project Initializer')}`,
            raw: true,
            entryOnly: true
        }),
        {
            apply: (compiler) => {
                compiler.hooks.afterEmit.tap('CopyAfterBundlePlugin', (compilation) => {
                    const packageJsonString = readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8');
                    const packageJson = JSON.parse(packageJsonString);

                    packageJson.main = './cli.js';
                    packageJson.bin = {
                        "create-mahameru": "./cli.js"
                    };

                    delete packageJson.files;
                    delete packageJson.dependencies;
                    delete packageJson.devDependencies;
                    delete packageJson.scripts;

                    writeFileSync(path.resolve(__dirname, 'dist/package.json'), JSON.stringify(packageJson, null, 2));
                    execSync('npm pack', { stdio: 'inherit', cwd: path.resolve(__dirname, 'dist') });
                    renameSync(path.resolve(__dirname, 'dist', `${packageJson.name}-${packageJson.version}.tgz`), path.resolve(__dirname, `dist.tgz`));
                    copyFileSync(path.resolve(__dirname, 'README.md'), path.resolve(__dirname, 'dist', 'README.md'));
                });
            },
        },
    ]
};

export default config;

import path from 'path';
import { fileURLToPath } from 'url';
import nodeExternals from 'webpack-node-externals';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import webpack from 'webpack';
import pkg from './package.json' with { type: 'json' };
import TerserPlugin from 'terser-webpack-plugin';
import boxen from 'boxen';
import stripAnsi from 'strip-ansi';

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

const configBase: webpack.Configuration = {
    target: 'node',
    mode: 'production',
    experiments: {
        outputModule: true,
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    keep_classnames: true,
                    keep_fnames: true,
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
        nodeExternals({
            importType: 'module',
            allowlist: [/^[^.]/]
        }),
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
        plugins: [new TsconfigPathsPlugin({ configFile: './tsconfig.json' })],
    },

};

const config: webpack.Configuration[] = [
    {
        ...configBase,
        entry: './src/index.ts',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'index.js',
            chunkFormat: 'module',
            library: { type: 'module' },
        },
        plugins: [
            new webpack.BannerPlugin({
                banner: createAsciiBox('▲ MahameruJS'),
                raw: true,
                entryOnly: true
            })
        ]
    },
    {
        ...configBase,
        entry: './src/core/index.ts',
        output: {
            path: path.resolve(__dirname, 'dist/core'),
            filename: 'index.js',
            chunkFormat: 'module',
            library: { type: 'module' },
        },
        plugins: [
            new webpack.BannerPlugin({
                banner: createAsciiBox('▲ MahameruJS - CORE'),
                raw: true,
                entryOnly: true
            })
        ]
    }
]

export default config;

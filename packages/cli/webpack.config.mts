import path from 'path';
import nodeExternals from 'webpack-node-externals';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import boxen from 'boxen';
import stripAnsi from 'strip-ansi';
import pkg from './package.json' with { type: 'json' };
import { fileURLToPath } from 'url';
import { copyFileSync, cpSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const { version } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createAsciiBox(title: string) {
  const content = [
    title,
    `Version: ${version}`,
    `Built: ${new Date().getFullYear()}`,
    '',
    `Copyright (c) Bintan <hello@bintvn.co>`,
    `Licensed under the ISC License.`,
  ].join('\n');

  const boxed = boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'single',
    align: 'left',
  });

  const cleanBox = stripAnsi(boxed);
  const commentLines = cleanBox.split('\n').map((line: string) => ` * ${line}`);

  return ['/*!', ...commentLines, ' */'].join('\n');
}

const baseConfig: webpack.Configuration = {
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
            comments: /^!/,
          },
        },
      } as any),
    ],
  },
  externalsPresets: { node: true },
  externals: [nodeExternals()],
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
    ...baseConfig,
    entry: './src/cli/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'cli.js',
    },
    plugins: [
      new webpack.BannerPlugin({
        banner: `#!/usr/bin/env node\n${createAsciiBox('▲ MahameruJS - CLI')}\n`,
        raw: true,
        entryOnly: true,
      }),
      {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('CopyAfterBundlePlugin', (compilation) => {
            const packageJsonString = readFileSync(
              path.resolve(__dirname, 'package.json'),
              'utf-8',
            );
            const packageJson = JSON.parse(packageJsonString);

            delete packageJson.devDependencies;
            delete packageJson.scripts;

            writeFileSync(
              path.resolve(__dirname, 'dist/package.json'),
              JSON.stringify(packageJson, null, 2),
            );
            // cpSync(path.resolve(__dirname, '..', 'pm-dashboard', 'dist'), path.resolve(__dirname, 'dist', 'mpm'), { recursive: true });
            copyFileSync(
              path.resolve(__dirname, 'README.md'),
              path.resolve(__dirname, 'dist/README.md'),
            );
            execSync('npm pack', { stdio: 'inherit', cwd: path.resolve(__dirname, 'dist') });
            renameSync(
              path.resolve(__dirname, 'dist', `mahameru-cli-${version}.tgz`),
              path.resolve(__dirname, 'dist', 'dist.tgz'),
            );
          });
        },
      },
    ],
  },
];

export default config;

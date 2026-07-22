/* eslint-disable no-console */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { PackageJson } from 'type-fest';
import type { Endpoints } from '@octokit/types';
import ora from 'ora';
import pc from 'picocolors';
import { spawn } from 'node:child_process';

type FullRepo = Endpoints['GET /repos/{owner}/{repo}']['response']['data'];

export async function readPackageJsonFile(rootPath?: string): Promise<PackageJson> {
  const path = join(rootPath ?? process.cwd(), 'package.json');

  try {
    if (!existsSync(path)) throw new Error(`package.json file not found at ${path}`);

    const string = await readFile(path, 'utf-8');

    return JSON.parse(string) as PackageJson;
  } catch {
    throw new Error('Failed to read package.json file');
  }
}

export async function writePackageJsonFile(packageJson: PackageJson, targetPath?: string) {
  const path = targetPath
    ? !targetPath.endsWith('.json')
      ? `${targetPath}.json`
      : targetPath
    : join(process.cwd(), 'package.json');

  try {
    await writeFile(path, JSON.stringify(packageJson, null, 2));
  } catch {
    throw new Error('Failed to write package.json file');
  }
}

export async function getGithubPublicRepo(username: string) {
  const spinner = ora('Fetching templates...').start();
  const response = await fetch(`https://api.github.com/users/${username}/repos`, {
    method: 'GET',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch repositories');

  let repos = (await response.json()) as (FullRepo & { packageJson: PackageJson })[];

  repos = repos.filter(
    (repo) => repo.private === false && repo.name.startsWith('mahameru-template-'),
  );

  for (const repo of repos) {
    repo.packageJson = await getPackageJsonFromGithubResponse(repo);
  }

  spinner.succeed(pc.green('Templates fetched successfully!'));

  return repos;
}

export async function getPackageJsonFromGithubResponse(repo: FullRepo): Promise<PackageJson> {
  const responsePackageJson = await fetch(
    `https://raw.githubusercontent.com/${repo.full_name}/refs/heads/main/package.json`,
    {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      },
    },
  );

  if (!responsePackageJson.ok) throw new Error('Failed to fetch package.json');

  return await responsePackageJson.json();
}

export function clearScreen(): void {
  process.stdout.write('\u001B[3J\u001B[2J\u001B[H');

  if (process.platform === 'win32') {
    process.stdout.write('\x1Bc');
  }
}

export function getManualGlobalInstallCommand() {
  return process.platform === 'win32'
    ? 'npm install -g @mahameru/cli'
    : 'sudo npm install -g @mahameru/cli';
}

export function getNpmRunner() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath && extname(npmExecPath) === '.js' && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath],
    };
  }

  const nodeDir = dirname(process.execPath);
  const candidatePaths = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return {
        command: process.execPath,
        args: [candidatePath],
      };
    }
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [],
  };
}

export async function ensureGlobalCliInstalled() {
  const globalInstallSpinner = ora('Installing @mahameru/cli globally...\n').start();
  const npmRunner = getNpmRunner();

  try {
    await runCommand(npmRunner.command, [...npmRunner.args, 'install', '-g', '@mahameru/cli']);
    globalInstallSpinner.succeed(pc.green('@mahameru/cli installed globally successfully!'));
    return true;
  } catch {
    globalInstallSpinner.fail(pc.red('Failed to install @mahameru/cli globally automatically.'));

    console.log(pc.yellow('\nWarning: Permission denied or network issue encountered.'));

    if (process.platform === 'win32') {
      console.log(
        'Please install the CLI manually from Command Prompt / PowerShell as Administrator:',
      );
    } else {
      console.log('Please install the CLI manually using:');
    }

    console.log(pc.bold(pc.white(`   ${getManualGlobalInstallCommand()}`)));

    return false;
  }
}

export function runCommand(command: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd,
      stdio: 'ignore',
      shell: false,
    });

    childProcess.on('error', reject);
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageJson } from 'type-fest';
import type { Endpoints } from '@octokit/types';
import ora from 'ora';
import pc from 'picocolors';

type FullRepo = Endpoints['GET /repos/{owner}/{repo}']['response']['data'];

export async function readPackageJsonFile(rootPath?: string): Promise<PackageJson> {
  const path = join(rootPath ?? process.cwd(), 'package.json');

  try {
    if (!existsSync(path)) throw new Error(`package.json file not found at ${path}`);

    const string = await readFile(path, 'utf-8');

    return JSON.parse(string) as PackageJson;
  } catch (error) {
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
  } catch (error) {
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
    (repo: any) => repo.private === false && repo.name.startsWith('mahameru-template-'),
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

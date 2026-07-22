#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';
import inquirer from 'inquirer';
import { existsSync, rmdirSync } from 'node:fs';
import path, { join } from 'node:path';
import { downloadTemplate } from 'giget';
import ora from 'ora';
import pc from 'picocolors';
import { execSync, spawn } from 'node:child_process';
import {
  clearScreen,
  getGithubPublicRepo,
  readPackageJsonFile,
  writePackageJsonFile,
} from './utils';

(async () => {
  try {
    const program = new Command();

    program
      .name('create-mahameru')
      .version(version, '-v, --version')
      .description(
        'Initialize a new project Mahameru - A minimal and fast Node.js framework for building HTTP servers',
      )
      .action(onInit);

    program.parseAsync(process.argv);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'ExitPromptError' || error.message.includes('force closed'))
    ) {
      console.log('\n👋 Process cancelled by user. Exiting safely...');

      process.exit(0);
    }

    console.error('xxxx', error);

    process.exit(1);
  }
})();

function isCliInstalled() {
  try {
    execSync('mahameru -v', { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

function isGitInstalled() {
  try {
    execSync('git -v', { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

function getManualGlobalInstallCommand() {
  return process.platform === 'win32'
    ? 'npm install -g @mahameru/cli'
    : 'sudo npm install -g @mahameru/cli';
}

function getNpmRunner() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath && path.extname(npmExecPath) === '.js' && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath],
    };
  }

  const nodeDir = path.dirname(process.execPath);
  const candidatePaths = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
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

function runCommand(command: string, args: string[], cwd?: string) {
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

async function installProjectDependencies(
  targetDir: string,
  dependencies?: Partial<Record<string, string>> | undefined,
  devDependencies?: Partial<Record<string, string>> | undefined,
) {
  if (!dependencies && !devDependencies) {
    return true;
  }

  const npmRunner = getNpmRunner();
  const depsToInstall = Object.entries(dependencies ?? {}).map(
    ([pkg, version]) => `${pkg}@${version}`,
  );
  const devDepsToInstall = Object.entries(devDependencies ?? {}).map(
    ([pkg, version]) => `${pkg}@${version}`,
  );

  try {
    if (depsToInstall.length > 0) {
      for (const dep of depsToInstall) {
        const rawTitle = dep.startsWith('@')
          ? dep.substring(1).replace('^', '')
          : dep.replace('^', '');
        const depTitle = rawTitle.split('@')[0];
        const depVersion = rawTitle.split('@')[1].replace(/^/g, '');
        const installSpinner = ora(`Installing ${depTitle} v${depVersion}...`).start();
        await runCommand(npmRunner.command, [...npmRunner.args, 'i', dep], targetDir);
        installSpinner.succeed(pc.green(`Installed ${depTitle} v${depVersion}`));
      }
    }

    if (devDepsToInstall.length > 0) {
      for (const devDev of devDepsToInstall) {
        const rawTitle = devDev.startsWith('@')
          ? devDev.substring(1).replace('^', '')
          : devDev.replace('^', '');
        const depTitle = rawTitle.split('@')[0];
        const depVersion = rawTitle.split('@')[1].replace(/^/g, '');
        const installSpinner = ora(`Installing ${depTitle} v${depVersion}...`).start();
        await runCommand(npmRunner.command, [...npmRunner.args, 'i', '-D', devDev], targetDir);
        installSpinner.succeed(pc.green(`Installed ${depTitle} v${depVersion}`));
      }
    }

    return true;
  } catch (error) {
    console.error(pc.red('Failed to install project dependencies.'));
    console.log(pc.yellow(`\nPlease enter the folder and run:`));
    console.log(pc.yellow(`\tnpm install ${depsToInstall.join(' ')}`));
    console.log(pc.yellow(`\tnpm install -D ${devDepsToInstall.join(' ')}`));

    return false;
  }
}

async function ensureGlobalCliInstalled() {
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

async function onInit() {
  clearScreen();
  console.log(`${pc.bold(pc.cyan('▲ MahameruJS'))} ${pc.dim(`Project Initializer v${version}`)}\n`);

  const repos = await getGithubPublicRepo('mahamerujs');

  const answers = await inquirer
    .prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter your project name:',
        default: 'my-awesome-project',
        validate: (input) => {
          if (/^([A-Za-z\-_\d])+$/.test(input)) return true;
          return 'Project name may only contain letters, numbers, underscores, or dashes.';
        },
      },
      {
        type: 'select',
        name: 'selectedTemplate',
        message: 'Choose a template:',
        choices: repos.map((repo) => ({
          name: `${repo.packageJson.title} - ${repo.packageJson.description}`,
          value: repo.packageJson.name,
        })),
      },
    ])
    .catch((error) => {
      if (error.name === 'ExitPromptError') process.exit(0);

      throw error;
    });

  const selectedTemplate = repos.find((item) => item.packageJson.name === answers.selectedTemplate);

  if (!selectedTemplate) {
    console.log(pc.red(`\nError: Template ${answers.selectedTemplate} not found!`));

    process.exit(1);
  }

  const targetDir = path.join(process.cwd(), answers.projectName);

  if (existsSync(targetDir)) {
    console.log(pc.red(`\nError: Folder ${answers.projectName} already exists!`));

    process.exit(0);
  }

  const downloadSpinner = ora('Downloading template...\n').start();

  try {
    await downloadTemplate(`github:${selectedTemplate.full_name}#main`, {
      dir: targetDir,
      force: true,
    });

    const packageJson = await readPackageJsonFile(targetDir);

    packageJson.name = answers.projectName;
    packageJson.version = '0.0.0';

    delete packageJson.dependencies;
    delete packageJson.devDependencies;

    await writePackageJsonFile(packageJson, join(targetDir, 'package.json'));

    downloadSpinner.succeed(pc.green('Template downloaded successfully!'));
  } catch (err) {
    downloadSpinner.fail(pc.red('Failed to download template.'));
    console.error(err);

    if (existsSync(targetDir)) rmdirSync(targetDir);

    process.exit(1);
  }

  if (
    selectedTemplate.packageJson.dependencies &&
    Object.keys(selectedTemplate.packageJson.dependencies).length > 0
  )
    console.log(
      pc.cyan(
        `\nInstalling dependencies:\n   ${Object.keys(selectedTemplate.packageJson.dependencies).join('\n   ')}`,
      ),
    );

  if (
    selectedTemplate.packageJson.devDependencies &&
    Object.keys(selectedTemplate.packageJson.devDependencies).length > 0
  )
    console.log(
      pc.cyan(
        `\nInstalling dev dependencies:\n   ${Object.keys(selectedTemplate.packageJson.devDependencies).join('\n   ')}\n`,
      ),
    );

  await installProjectDependencies(
    targetDir,
    selectedTemplate.packageJson.dependencies,
    selectedTemplate.packageJson.devDependencies,
  );

  if (isGitInstalled()) {
    console.log('');
    const gitSpinner = ora('Initializing git repository...\n').start();
    await runCommand('git', ['init'], targetDir);
    gitSpinner.succeed(pc.green('Git repository initialized successfully!'));
  }

  let cliInstalled = isCliInstalled();

  console.log('\n---\n');
  console.log(pc.green(`Project ${pc.bold(answers.projectName)} was created successfully!`));

  if (!cliInstalled) {
    // cliInstalled = await ensureGlobalCliInstalled();
  }

  console.log(`\nTo get started, run the following commands:`);
  console.log(pc.yellow(`   cd ${answers.projectName}`));

  if (cliInstalled) {
    console.log(pc.yellow('   mahameru dev'));
  } else {
    console.log(pc.yellow('   npm run dev'));
  }

  console.log('---\n');

  console.log(`Create your first module by running:`);
  console.log(pc.yellow(`   cd ${answers.projectName}`));
  console.log(pc.yellow('   npm run generate'));
  console.log('---\n');

  console.log(
    `Have a question? Join the discord server at ${pc.cyan('https://discord.gg/7PNmMxykSF')}\n`,
  );
}

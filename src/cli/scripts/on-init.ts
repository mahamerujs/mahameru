import inquirer from "inquirer";
import { existsSync } from "node:fs";
import path from "node:path";
import degit from 'degit';
import ora from 'ora';
import pc from 'picocolors';
import { execSync } from "node:child_process";

export default async function onInit() {
    const repo = 'bintvn/mahameru-basic-template';
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'projectName',
            message: 'Enter your project name:',
            default: 'my-awesome-project',
            validate: (input) => {
                if (/^([A-Za-z\-_\d])+$/.test(input)) return true;
                return 'Project name may only contain letters, numbers, underscores, or dashes.';
            }
        }
    ]);

    const targetDir = path.join(process.cwd(), answers.projectName);

    if (existsSync(targetDir)) {
        console.log(pc.red(`\nError: Folder ${answers.projectName} already exists!`));
        process.exit(1);
    }

    const emitter = degit(repo, {
        cache: false,
        force: true,
    });

    const downloadSpinner = ora('Downloading template from GitHub...').start();

    try {
        await emitter.clone(targetDir);
        downloadSpinner.succeed(pc.green('Template downloaded successfully!'));
    } catch (err) {
        downloadSpinner.fail(pc.red('Failed to download template.'));
        console.error(err);
        process.exit(1);
    }

    const installSpinner = ora('Installing dependencies (npm install)...').start();

    try {
        execSync('npm install', { cwd: targetDir, stdio: 'ignore' });
        installSpinner.succeed(pc.green('Dependencies installed successfully!'));
    } catch (err) {
        installSpinner.fail(pc.red('Failed to install dependencies.'));
        console.log(pc.yellow('\nPlease enter the folder and run "npm install" manually.'));
    }

    console.log('\n---');
    console.log(pc.cyan(`Project ${pc.bold(answers.projectName)} was created successfully!`));
    console.log(`\nTo get started, run the following commands:`);
    console.log(pc.yellow(`   cd ${answers.projectName}`));
    console.log(pc.yellow(`   npm run dev (or your preferred start command)`));
    console.log('---\n');
}
import prompts from 'prompts';
import { printCliBanner } from '../../utils/printCliBanner';
import { clearScreen } from '../../utils/common';
import generateModule from '../scripts/generate-module';

export default function generate({ rootPath, version }: { rootPath: string; version: string }) {
    return async function () {
        clearScreen();
        printCliBanner(version);

        const response = await prompts([
            {
                type: 'select',
                name: 'type',
                message: 'Choose what you want to generate',
                choices: [
                    { title: 'Module', description: 'Generate a new MahameruJS module', value: 'module' }
                ],
                initial: 0
            },
            {
                type: 'text',
                name: 'typeName',
                message: prev => prev === 'module' ? 'Enter Module name' : 'Unknown type',
                initial: 'my-new-module',
                validate: (value: string) => {
                    if (value.includes(' ')) {
                        return 'Module name cannot contain spaces';
                    }

                    return true;
                },
                format: (value: string) => value.trim().toLowerCase()
            }
        ]);

        const { type, typeName } = response;

        if (type === "module") {
            await generateModule(rootPath, typeName);
        }
    }
}

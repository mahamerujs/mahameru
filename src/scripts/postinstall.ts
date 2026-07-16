import { join } from 'node:path'
import { Generator } from '../server/generator.js'

const rootPath = process.env.INIT_CWD || process.cwd();
const generator = new Generator({
    rootPath: rootPath,
    dev: true,
    appPath: join(rootPath, '.mahameru'),
    routesPath: join(rootPath, '.mahameru', 'routes'),
    modulesPath: join(rootPath, '.mahameru', 'modules'),
    outputTypesPath: join(rootPath, '.mahameru', '.types'),
    sourceDirPath: join(rootPath, 'src')
});

generator.start();

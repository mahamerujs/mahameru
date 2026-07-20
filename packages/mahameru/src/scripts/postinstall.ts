import { join } from 'node:path';
import { Mahameru } from '../mahameru';
import { createLogger } from '@mahameru/diatrema';

const rootPath = process.env.INIT_CWD || process.cwd();
const typesDirPath = join(rootPath, '.types');
const generator = Mahameru.generator({
    dev: true,
    outputTypesDirPath: typesDirPath,
    rootPath
},
    createLogger(['Mahameru', 'postinstall'], true)
);

(async () => {
    await generator.env();
    await generator.barrelIndexFile(typesDirPath);
    await generator.mahameruDts();
    await generator.appendMahameruDTSToTsConfig();
})();

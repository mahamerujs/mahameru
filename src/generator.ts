
import path from 'path'
import { TORMDTOGenerator } from 'typeorm-dto-generator'
import { ModelGenerator } from './lib/model.generator.js'

const root = process.cwd()

const dto = new TORMDTOGenerator({
    entityPaths: [path.join(root, 'src', 'databases', 'db-test', 'entities', '*.entity.ts')],
    dtoOutputDir: path.join(root, 'src', 'types'),
    mapperOutputFile: path.join(root, 'src', 'common', 'dto', 'mapper.dto.ts'),
    debug: true
})

const srcPath = path.join(root, 'src')
const entitiesPath = path.join(srcPath, 'databases', 'db-test', 'entities')
const outputPath = path.join(srcPath, 'models')
const dataSourceFilePath = path.join(srcPath, 'databases', 'db-test')

const model = new ModelGenerator({
    dbName: 'db-test',
    srcPath,
    entitiesPath,
    outputPath,
    dataSourceFilePath,
    debug: true
})

const generator = {
    dto,
    model
}

export async function generateDTO(dir: string) {
    const newDir = dir.split('/').slice(0, -1).join('/')

    const dto = new TORMDTOGenerator({
        entityPaths: [path.join(root, newDir, '*.entity.ts')],
        dtoOutputDir: path.join(root, 'src', 'types'),
        mapperOutputFile: path.join(root, 'src', 'common', 'dto', 'mapper.dto.ts'),
        debug: true
    })

    await dto.run()
}

export default generator

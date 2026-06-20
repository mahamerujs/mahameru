import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { root } from '../constants.js'

export async function createRequiredEnvFile() {
    const envDefaultPath = path.join(root, '.env')
    const envDevelopmentPath = path.join(root, '.env.development')

    if (!existsSync(envDefaultPath))
        await writeFile(envDefaultPath, 'APP_NAME=Mahameru Node.js Framework', 'utf-8')

    if (!existsSync(envDevelopmentPath)) {
        const devEnv = ``

        await writeFile(envDevelopmentPath, devEnv, 'utf-8')
    }
}

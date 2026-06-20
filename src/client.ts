import { Mahameru, type MahameruConfig } from "./mahameru.js"

const mahameru = (config: MahameruConfig) => {
    try {
        const mahameru = new Mahameru(config)

        return mahameru
    } catch (err) {
        console.error(err)

        process.exit(1)
    }
}

export default mahameru

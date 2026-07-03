import { type MahameruConfig as MahameruOriginalConfig, mahameruDefaultBaseConfig, mahameruDefaultConfig } from './config';
import { Mahameru } from './mahameru';

export type MahameruConfig = MahameruOriginalConfig & {
    /**
     * Tell MahameruJS that this is Development Mode or not.
     * @default false
     */
    dev: boolean
}

export const mahameru = (config: Partial<MahameruConfig>) => {
    if (typeof config.dev === 'undefined')
        config.dev = false

    return new Mahameru({
        ...mahameruDefaultBaseConfig,
        ...mahameruDefaultConfig,
        ...config
    });
}

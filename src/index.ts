import { Mahameru, MahameruContainer, type MahameruConfig } from "./core/index.js";

export default async (options?: Partial<MahameruConfig>) =>
    new Mahameru(options, new MahameruContainer())

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const root = process.cwd();
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
export const isCommonJS = typeof module !== 'undefined' && !!module.exports;
export const isESModule = !isCommonJS;

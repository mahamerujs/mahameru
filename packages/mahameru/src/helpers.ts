import { access, constants } from "node:fs/promises";

export const exists = async (target: string): Promise<boolean> => {
    try {
        await access(target, constants.R_OK);

        return true;
    } catch (error) {
        return false;
    }
}

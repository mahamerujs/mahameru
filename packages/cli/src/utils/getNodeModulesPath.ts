import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

export function getNodeModulesPath() {
    try {
        const npm = join(dirname(process.execPath), "npm");

        const result = execFileSync(
            npm,
            ["root", "-g"],
            {
                stdio: ["ignore", "pipe", "ignore"]
            }
        );

        return result.toString().trim();
    } catch {
        throw new Error("Unable to determine global node_modules path.");
    }
}

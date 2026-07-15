import { access, constants } from "node:fs/promises";
import type { HTTPMethod, ProtectedRoute } from "@mahameru/diatrema";

const matchRoutePattern = (currentPath: string, routePattern: string): boolean => {
    const regexPattern = routePattern
        .replace(/\//g, '\\/')
        .replace(/:[^/]+/g, '[^/]+');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(currentPath);
};

export const validateProtectedRoute = (protectedRoutes: ProtectedRoute, method: string, path: string): boolean => {
    return protectedRoutes.some(route => {
        if (typeof route === 'string')
            return matchRoutePattern(path, route);

        const isPathMatch = matchRoutePattern(path, route.path);
        const isMethodMatch = route.methods.includes(method as HTTPMethod);

        return isPathMatch && isMethodMatch;
    });
}

export const exists = async (target: string): Promise<boolean> => {
    try {
        await access(target, constants.R_OK);

        return true;
    } catch (error) {
        return false;
    }
}

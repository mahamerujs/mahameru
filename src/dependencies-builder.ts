import {
    createLogger,
    Container,
    HttpServer,
    Route,
    ContainerError,
    MahameruResponse,
    HttpServerError,
    MahameruRequest,
    MahameruServerError,
    ModuleError,
    type DiatremaDependencies
} from "@mahameru/diatrema";
import type { MahameruConfig } from "./config";

export type DiatremaDependenciesOptions = {
    dev: boolean
    mahameruConfig: MahameruConfig
}

const diatremaDependencies = (options: DiatremaDependenciesOptions): DiatremaDependencies => {
    const logger = createLogger(options.dev);
    const container = new Container({
        dev: options.dev
    }, {
        ContainerError,
        ModuleError
    })

    const route = new Route({
        dev: options.dev
    }, {
        container,
        MahameruResponse,
        HttpServerError
    });

    const httpServer = new HttpServer({
        dev: options.dev,
        ...options.mahameruConfig
    }, {
        container,
        route,
        logger,
        HttpServerError,
        MahameruRequest,
        MahameruResponse,
        MahameruServerError
    }
    );

    return {
        httpServer,
        container,
        route,
        logger
    }
}

export default diatremaDependencies;

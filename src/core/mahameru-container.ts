import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { MahameruError } from './index.js';

export type ClassConstructor<T = any> = new (...args: any[]) => T;

export class MahameruContainer {
    private instances = new Map<ClassConstructor, any>();

    register<T>(ClassTarget: ClassConstructor<T>, instance: T) {
        this.instances.set(ClassTarget, instance);
    }

    get<T>(ClassTarget: ClassConstructor<T>): T {
        const instance = this.instances.get(ClassTarget);

        if (!instance) {
            throw new MahameruError(`Dependency '${ClassTarget.name}' is not found in the container.`);
        }

        return instance;
    }

    async autoDiscover(modulesDir: string) {
        if (!fs.existsSync(modulesDir))
            return;

        const folders = fs.readdirSync(modulesDir, { withFileTypes: true });

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const servicePath = path.join(modulesDir, folder.name, `${folder.name}.service.ts`);

                if (fs.existsSync(servicePath)) {
                    const fileUrl = pathToFileURL(path.resolve(servicePath)).href;
                    const module = await import(/* webpackIgnore: true */ fileUrl);
                    const ServiceClass = Object.values(module)[0] as ClassConstructor;

                    this.register(ServiceClass, new ServiceClass());
                }
            }
        }

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const controllerPath = path.join(modulesDir, folder.name, `${folder.name}.controller.ts`);
                const servicePath = path.join(modulesDir, folder.name, `${folder.name}.service.ts`);

                if (fs.existsSync(controllerPath)) {
                    const controllerUrl = pathToFileURL(path.resolve(controllerPath)).href;
                    const controllerModule = await import(/* webpackIgnore: true */ controllerUrl);
                    const ControllerClass = Object.values(controllerModule)[0] as ClassConstructor;

                    if (fs.existsSync(servicePath)) {
                        const serviceUrl = pathToFileURL(path.resolve(servicePath)).href;
                        const serviceModule = await import(/* webpackIgnore: true */ serviceUrl);
                        const ServiceClass = Object.values(serviceModule)[0] as ClassConstructor;
                        const injectedService = this.get(ServiceClass);

                        this.register(ControllerClass, new ControllerClass(injectedService));
                    } else {
                        this.register(ControllerClass, new ControllerClass());
                    }
                }
            }
        }
    }
}

import { MahameruMode } from "./mahameru";

export interface MahameruIPCChildDataMap {
    RELOAD: { runtimeVersion: string; timestamp: number };
    RESTART: undefined;
    SHUTDOWN: { gracePeriod: number } | undefined;
    DEV_HRM: { changedFile?: string }
    GENERATE_ROUTE_TYPES: undefined
}

export type MahameruIPCChildMessageTypes = keyof MahameruIPCChildDataMap;

export type MahameruIPCMessageChild<K extends MahameruIPCChildMessageTypes = MahameruIPCChildMessageTypes> = {
    [P in K]: {
        type: P;
    } & (MahameruIPCChildDataMap[P] extends undefined
        ? { data?: undefined }
        : { data: MahameruIPCChildDataMap[P] });
}[K];

export interface MahameruIPCServerDataMap {
    SHUTDOWN_DONE: undefined;
    GENERATE_ROUTE_TYPES_DONE: undefined;
    ERROR: { message: string; stack?: string; code?: string };
    READY: { mode: MahameruMode; port: number; host: string };
    LOG: string;
}

export type MahameruIPCServerMessageTypes = keyof MahameruIPCServerDataMap;

export type MahameruIPCMessageServer<K extends MahameruIPCServerMessageTypes = MahameruIPCServerMessageTypes> = {
    [P in K]: {
        type: P;
    } & (MahameruIPCServerDataMap[P] extends undefined
        ? { data?: undefined }
        : { data: MahameruIPCServerDataMap[P] });
}[K];

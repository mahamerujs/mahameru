import { Socket as SocketOriginal } from "socket.io";
import { Project } from ".";
import { Login } from "./pm.config";

export type Socket = SocketOriginal<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
export type SocketResponseSuccess<T> = { success: true; data: T }
export type SocketResponseError = { success: false; error: string; }

export interface ServerToClientEvents {
    noArg: () => void;
    'project-update': (project: Project) => void;
    'project-delete': (project: Project) => void;
    'project-create': (project: Project) => void;
    'projects': (projects: Project[]) => void;
    'process-usage': (payload: { project: Project; data: ProcessUsage }) => void;
    withAck: (d: string, callback: (e: number) => void) => void;
    receiveMessage: (message: { user: string; text: string }) => void;
}

export interface ClientToServerEvents {
    stop: (name: string, callback: (response: SocketResponseSuccess<Project> | SocketResponseError) => void) => void;
    start: (name: string, callback: (response: SocketResponseSuccess<Project> | SocketResponseError) => void) => void;
    delete: (name: string, callback: (response: SocketResponseSuccess<Project> | SocketResponseError) => void) => void;
    remove: (name: string, callback: (response: SocketResponseSuccess<Project> | SocketResponseError) => void) => void;
    getProjects: (callback: (response: SocketResponseSuccess<Project[]> | SocketResponseError) => void) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export interface SocketData {
    login: Login
}

export type ProcessUsage = {
    cpu: {
        user: string,
        system: string,
        usage: string
    },
    memory: {
        rss: string,
        heapTotal: string,
        heapUsed: string,
        external: string
    },
    uptime: string
    raw: {
        cpu: {
            user: number,
            system: number
        },
        memory: {
            rss: number,
            heapTotal: number,
            heapUsed: number,
            external: number,
            arrayBuffers: number
        },
        uptime: number
    }
}

import { ManagedProject, Project } from "../types";

export function parseProject(project: ManagedProject): Project {
    return {
        id: project.id,
        pid: project.pid,
        createdAt: project.createdAt,
        isDisabled: project.isDisabled,
        name: project.name,
        description: project.description,
        version: project.version,
        mode: project.mode,
        rootPath: project.rootPath,
        logDirPath: project.logDirPath,
        entryFilePath: project.entryFilePath,
        port: project.port,
        host: project.host,
        status: project.status,
        isLastStatusIsRunning: project.isLastStatusIsRunning,
        packageJson: project.packageJson
    }
}

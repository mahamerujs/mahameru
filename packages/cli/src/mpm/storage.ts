import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PROJECTS_FILE_PATH } from "../constants";
import { parseProject } from "../utils/parse-project";
import type { ManagedProject, Project, Socket } from "../types";

const projects = new Map<string, ManagedProject>();

export const getProjects = () => Array.from(projects.values());
export const getProject = (name: string) => projects.get(name);
export const setProject = (project: ManagedProject) => {
    projects.set(project.name, project);

    return project;
};
export const setProjects = (projects: ManagedProject[]) => projects.forEach(setProject);
export const deleteProject = (name: string) => projects.delete(name);
export const clearProjects = () => projects.clear();

const sockets = new Map<string, Socket>();

export const getSockets = () => Array.from(sockets.values());
export const getSocket = (id: string) => sockets.get(id);
export const setSocket = (socket: Socket) => sockets.set(socket.id, socket);
export const deleteSocket = (id: string) => sockets.delete(id);
export const clearSockets = () => sockets.clear();

export const loadProjects = async () => {
    try {
        if (!existsSync(dirname(PROJECTS_FILE_PATH)))
            await mkdir(dirname(PROJECTS_FILE_PATH), { recursive: true });

        if (!existsSync(PROJECTS_FILE_PATH)) {
            await writeFile(PROJECTS_FILE_PATH, '[]', 'utf-8');

            return [];
        }

        const json = await readFile(PROJECTS_FILE_PATH, 'utf-8');
        const data = JSON.parse(json) as Project[];

        for (const [index, project] of data.entries())
            if (!existsSync(join(project.rootPath, 'package.json')))
                data.splice(index, 1);

        await saveProjects(data);

        return data;
    } catch (error) {
        throw new Error('Failed to load projects');
    }
}

export const saveProjects = async (projects?: ManagedProject | ManagedProject[]) => {
    try {
        if (!projects) {
            projects = getProjects().map(parseProject);
        } else {
            if (!Array.isArray(projects)) {
                setProject(projects);

                projects = getProjects().map(parseProject);
            }
        }

        const dataToSave = projects.map(parseProject);
        const json = JSON.stringify(dataToSave, null, 2);

        await writeFile(PROJECTS_FILE_PATH, json, 'utf-8');
    } catch (error) {
        throw new Error('Failed to save projects');
    }
}

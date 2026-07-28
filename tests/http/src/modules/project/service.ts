import { MagmaResponse, type MagmaContainer } from "@mahameru/magma";

export type Project = {
  id: string;
  name: string;
};

export default class ProjectService {
  protected projects = new Map<string, Project>();

  constructor(_container: MagmaContainer) {
    this.createBatch([
      {
        name: 'Project 1',
      },
      {
        name: 'Project 2',
      },
      {
        name: 'Project 3',
      },
    ]);
  }

  getAll() {
    return Array.from(this.projects.values());
  }

  getOneById(id: string) {
    const found = this.projects.get(id);

    if (!found)
      throw MagmaResponse.json(
        {
          success: false,
          message: `Project with id ${id} not found`,
        },
        {
          status: 404,
        },
      );

    return found;
  }

  create(project: Omit<Project, 'id'>) {
    const latestId = this.projects.keys().next().value;
    const nextId = Number(latestId) + 1;
    const id = nextId.toString();

    const newProject: Project = {
      id,
      ...project,
    };

    this.projects.set(id, newProject);

    return newProject;
  }

  createBatch(projects: Omit<Project, 'id'>[]) {
    const newProjects: Project[] = [...projects.map((project) => ({ id: '', ...project }))];
    const latestIdString = this.projects.keys().next().value;
    let latestId = latestIdString ? Number(latestIdString) : 0;

    for (const newProject of newProjects) {
      latestId += 1;
      newProject.id = latestId.toString();

      this.projects.set(newProject.id, newProject);
    }

    return newProjects;
  }

  updateById(id: string, project: Project): Project {
    const existingData = this.getOneById(id);

    this.projects.set(existingData.id, project);

    return this.getOneById(id);
  }

  deleteById(id: string) {
    const existingData = this.getOneById(id);

    return this.projects.delete(existingData.id);
  }
}

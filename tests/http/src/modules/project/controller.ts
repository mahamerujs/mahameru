import { type MagmaContainer, type MagmaRequest, MagmaResponse } from '@mahameru/magma';
import type { Project } from './service';

export default class ProjectController {
  constructor(protected readonly container: MagmaContainer) {}

  getAllProject() {
    const data = this.container.modules.project.service.getAll();

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  getProjectById(_request: MagmaRequest, id: string) {
    const data = this.container.modules.project.service.getOneById(id);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async createProject(request: MagmaRequest) {
    const project: Project = await request.json();
    const data = this.container.modules.project.service.create(project);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async deleteProject(_request: MagmaRequest, id: string) {
    const data = this.container.modules.project.service.deleteById(id);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }

  async updateProject(request: MagmaRequest, id: string) {
    const project: Project = await request.json();
    const data = this.container.modules.project.service.updateById(id, project);

    return MagmaResponse.json({
      success: true,
      data,
    });
  }
}

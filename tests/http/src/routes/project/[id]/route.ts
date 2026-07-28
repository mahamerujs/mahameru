import type { RouteHandler } from '@mahameru/magma';

export const GET: RouteHandler = ({ request, container, params }) => {
  return container.modules.project.controller.getProjectById(request, params.id);
};

export const PATCH: RouteHandler = async ({ request, container, params }) => {
  return container.modules.project.controller.updateProject(request, params.id);
};

export const PUT: RouteHandler = async ({ request, container, params }) => {
  return container.modules.project.controller.updateProject(request, params.id);
};

export const DELETE: RouteHandler = ({ request, container, params }) => {
  return container.modules.project.controller.deleteProject(request, params.id);
};

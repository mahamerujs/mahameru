import type { RouteHandler } from '@mahameru/magma';

export const GET: RouteHandler = ({ request, container, params }) => {
  return container.modules.user.controller.getUserById(request, params.id);
};

export const PATCH: RouteHandler = async ({ request, container, params }) => {
  return container.modules.user.controller.updateUser(request, params.id);
};

export const PUT: RouteHandler = async ({ request, container, params }) => {
  return container.modules.user.controller.updateUser(request, params.id);
};

export const DELETE: RouteHandler = ({ request, container, params }) => {
  return container.modules.user.controller.deleteUser(request, params.id);
};

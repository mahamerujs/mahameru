import type { RouteHandler } from '@mahameru/magma';

export const GET: RouteHandler = ({ container }) => {
  return container.modules.user.controller.getAllUser();
};

export const POST: RouteHandler = async ({ request, container }) => {
  return container.modules.user.controller.createUser(request);
};

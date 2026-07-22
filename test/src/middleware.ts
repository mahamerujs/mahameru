import { MagmaResponse, type MagmaMiddleware, type ProtectedRoute } from '@mahameru/magma';

export const protectedRoutes: ProtectedRoute = [];

const middleware: MagmaMiddleware = async ({ isProtectedRoute }, next) => {
  try {
    if (isProtectedRoute) {
      // Add authentication logic here
      // Then return a MagmaResponse instance if authentication fails

      return MagmaResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    return await next();
  } catch (error) {
    return MagmaResponse.json(
      { success: false, message: 'Internal Server Error' },
      { status: 500 },
    );
  }
};

export default middleware;

import { type RouteHandler, MagmaResponse } from '@mahameru/magma';

export const GET: RouteHandler = () => {
    return MagmaResponse.json({
        success: true,
        message: mahameruEnv.WELCOME_MESSAGE
    });
}

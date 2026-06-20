import type { Request as ExpressRequest } from "express"

declare global {
    namespace Express {
        interface Request {
            ipAddress: string
            userAgent: string
        }
    }

    interface AuthenticatedRequest extends ExpressRequest {
        user: {
            id: string;
            role: string;
        }
        sessionId: string
    }

    type RequestSchema = {
        body?: any
        params?: any
        query?: any
    }

    type ValidatedRequest<T extends RequestSchema> = ExpressRequest<
        T["params"],
        any,
        T["body"],
        T["query"]
    >

    type AuthenticatedValidatedRequest<T extends RequestSchema> =
        AuthenticatedRequest & ExpressRequest<
            T["params"],
            any,
            T["body"],
            T["query"]
        >

    type ValidatedBodyRequest<T extends { body: any }> = ValidatedRequest<T>

    type AuthenticatedBodyRequest<T extends { body: any }> =
        AuthenticatedValidatedRequest<T>
}

export { }

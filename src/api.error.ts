export const APIErrorCode = {
    BAD_REQUEST: 'BAD_REQUEST',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
    TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
    CONFLICT: 'CONFLICT',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
    ACCESS_TOKEN_EXPIRED: 'ACCESS_TOKEN_EXPIRED',
    ACCESS_TOKEN_REQUIRED: 'ACCESS_TOKEN_REQUIRED',
    TOKEN_REFRESH_TOO_EARLY: 'TOKEN_REFRESH_TOO_EARLY',
    EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
    PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',
    TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
    INVALID_TOKEN: 'INVALID_TOKEN',
    RESET_PASSWORD_TOKEN_USED: 'RESET_PASSWORD_TOKEN_USED',
    RESET_PASSWORD_NEEDED: 'RESET_PASSWORD_NEEDED',
    ROLE_DISABLED: 'ROLE_DISABLED',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    SESSION_DISABLED: 'SESSION_DISABLED',
    INVALID_RESPONSE: 'INVALID_RESPONSE',
    UNKNOWN_CLIENT_ERROR: 'UNKNOWN_CLIENT_ERROR',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    VALIDATION_ERROR: 'VALIDATION_ERROR'
} as const

export type APIErrorCode = (typeof APIErrorCode)[keyof typeof APIErrorCode]

export const API_ERROR_STATUS: Record<APIErrorCode, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    ROUTE_NOT_FOUND: 404,
    TOO_MANY_REQUESTS: 429,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    TOKEN_EXPIRED: 401,
    REFRESH_TOKEN_EXPIRED: 401,
    ACCESS_TOKEN_EXPIRED: 401,
    ACCESS_TOKEN_REQUIRED: 401,
    TOKEN_REFRESH_TOO_EARLY: 403,
    EMAIL_NOT_VERIFIED: 401,
    PHONE_NOT_VERIFIED: 401,
    TOKEN_NOT_FOUND: 404,
    INVALID_TOKEN: 401,
    RESET_PASSWORD_TOKEN_USED: 401,
    RESET_PASSWORD_NEEDED: 400,
    ROLE_DISABLED: 403,
    SESSION_NOT_FOUND: 404,
    SESSION_DISABLED: 401,
    INVALID_RESPONSE: 500,
    UNKNOWN_CLIENT_ERROR: 400,
    INVALID_CREDENTIALS: 400,
    VALIDATION_ERROR: 400
}

export type APIErrorDetailsMap = {
    TOKEN_REFRESH_TOO_EARLY: {
        retryIn: number
        retryAt: number
    },
    TOO_MANY_REQUESTS: {
        retryIn: number
        retryAt: number
    },
    VALIDATION_ERROR: {
        details: {
            field: PropertyKey
            message: string
        }[]
    }
}

export type APIErrorDetails<T extends APIErrorCode> = T extends keyof APIErrorDetailsMap ? APIErrorDetailsMap[T] : never

type APIErrorCodeWithDetails = keyof APIErrorDetailsMap
type APIErrorCodeWithoutDetails = Exclude<APIErrorCode, APIErrorCodeWithDetails>
type AnyAPIErrorDetails = APIErrorDetailsMap[APIErrorCodeWithDetails]
type APIErrorConstructorArgs =
    | [code: APIErrorCodeWithoutDetails, message?: string]
    | {
        [TCode in APIErrorCodeWithDetails]: [
            code: TCode,
            message: string | undefined,
            details: APIErrorDetails<TCode>
        ]
    }[APIErrorCodeWithDetails]

export class APIError extends Error {
    public code: APIErrorCode
    public readonly status: number
    public readonly details?: AnyAPIErrorDetails

    constructor(...args: APIErrorConstructorArgs) {
        const [code, message, details] = args

        super(message)
        this.name = 'APIError'
        this.code = code
        this.status = API_ERROR_STATUS[code]
        this.details = details

        Object.setPrototypeOf(this, APIError.prototype)
    }
}

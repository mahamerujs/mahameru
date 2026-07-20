export enum LoginRole {
    ADMIN = 'admin',
    USER = 'user'
}

export type LoginRoleType = `${LoginRole}`

export type Login = {
    username: string;
    password: string;
    role: LoginRoleType
}

export type ProcessManagerConfig = {
    host: string;
    port: number;
    cert?: string;
    key?: string;
    logins: Login[]
};

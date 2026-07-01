export type TypeOrmDataSource = globalThis.Record<string, any> extends typeof import('typeorm')
    ? any
    : import('typeorm').DataSource;

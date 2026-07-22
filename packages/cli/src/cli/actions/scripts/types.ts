export interface StrictServerOptions {
  port: number;
  host: string;
}

export interface DevEnvironment {
  rootPath: string;
  tsxJsPath: string;
  tscJsPath: string;
  tscAliasJsPath: string;
}

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  types?: string;
  typings?: string;
  type?: 'commonjs' | 'module';
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  author?: string | { name: string; email?: string; url?: string };
  license?: string;
  repository?: string | { type: string; url: string };
  bugs?: string | { url?: string; email?: string };
  homepage?: string;
  [key: string]: any;
}

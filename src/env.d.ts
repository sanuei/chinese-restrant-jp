type D1Value = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    CACHE: KVNamespace;
  }

  namespace NodeJS {
    interface ProcessEnv {
      // API Keys
      GOOGLE_MAPS_API_KEY: string;
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: string;
      MINIMAX_API_KEY: string;
      MINIMAX_API_BASE: string;
      
      // Admin
      ADMIN_SECRET: string; // 用于保护 /api/admin/* 路由
    }
  }
}

export {};

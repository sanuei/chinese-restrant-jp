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

interface R2Object {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    CACHE: KVNamespace;
    IMAGES: R2Bucket;
  }

  namespace NodeJS {
    interface ProcessEnv {
      // API Keys
      GOOGLE_MAPS_API_KEY: string;
      MINIMAX_API_KEY: string;
      MINIMAX_API_BASE: string;
      
      // Admin
      ADMIN_SECRET: string; // 用于保护 /api/admin/* 路由
      NEXT_PUBLIC_ADMIN_TOKEN: string; // 公开暴露给客户端用于 admin 页面 API 调用

      // 用户登录（Auth.js + Google OAuth）
      AUTH_SECRET: string; // JWT 签名密钥
      AUTH_GOOGLE_ID: string;
      AUTH_GOOGLE_SECRET: string;
      AUTH_URL?: string; // 生产环境显式指定站点地址
      AUTH_TRUST_HOST?: string; // Cloudflare Workers 反向代理环境需要设为 "true"
    }
  }
}

export {};

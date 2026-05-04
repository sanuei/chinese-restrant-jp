// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { D1Database, KVNamespace, R2Bucket } from "@cloudflare/workers-types";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Cloudflare Bindings
      DB: D1Database;
      CACHE: KVNamespace;
      IMAGES: R2Bucket;
      
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

import { defineConfig } from "vitest/config";

/**
 * Valores de ambiente usados SOMENTE durante a execução dos testes.
 * Nunca tocam o banco real nem o .env de desenvolvimento — servem apenas
 * para satisfazer a validação de env.ts nos testes que importam módulos
 * que dependem dele (ex: auth), sem exigir PostgreSQL rodando.
 */
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
      JWT_SECRET: "test-only-secret-not-used-in-production",
      JWT_EXPIRES_IN: "8h",
      CORS_ORIGIN: "http://localhost:5173",
      PORT: "3333",
    },
  },
});

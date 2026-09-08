import { describe, it, expect } from "vitest";
import { envSchema, EXAMPLE_JWT_SECRET } from "../env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
  JWT_SECRET: "um-segredo-suficientemente-longo-para-passar",
  JWT_EXPIRES_IN: "8h",
};

describe("validação de env", () => {
  it("aceita uma configuração válida", () => {
    expect(envSchema.safeParse(baseEnv).success).toBe(true);
  });

  it("recusa JWT_SECRET com menos de 16 caracteres", () => {
    const result = envSchema.safeParse({ ...baseEnv, JWT_SECRET: "curto" });
    expect(result.success).toBe(false);
  });

  it("recusa JWT_SECRET ausente", () => {
    const semSegredo = {
      DATABASE_URL: baseEnv.DATABASE_URL,
      JWT_EXPIRES_IN: baseEnv.JWT_EXPIRES_IN,
    };
    expect(envSchema.safeParse(semSegredo).success).toBe(false);
  });

  // D6 — este valor tem 57 caracteres e passava na validação de tamanho,
  // permitindo subir a aplicação com o segredo público do .env.example.
  it("recusa o valor de exemplo do .env.example", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      JWT_SECRET: EXAMPLE_JWT_SECRET,
    });

    expect(result.success).toBe(false);
    expect(EXAMPLE_JWT_SECRET.length).toBeGreaterThan(16);
  });

  it("recusa DATABASE_URL vazia", () => {
    expect(envSchema.safeParse({ ...baseEnv, DATABASE_URL: "" }).success).toBe(false);
  });

  it("recusa JWT_EXPIRES_IN em formato inválido", () => {
    expect(
      envSchema.safeParse({ ...baseEnv, JWT_EXPIRES_IN: "oito horas" }).success,
    ).toBe(false);
  });
});

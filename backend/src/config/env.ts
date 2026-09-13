import "dotenv/config";
import { z } from "zod";

/**
 * Valor que acompanha o .env.example. Existe só para ser recusado: sem esta
 * checagem a aplicação subiria silenciosamente com um segredo público,
 * versionado no repositório, e todo token emitido seria forjável por
 * qualquer pessoa com acesso ao código.
 */
const EXAMPLE_JWT_SECRET =
  "troque-por-um-valor-aleatorio-de-pelo-menos-32-caracteres";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET é obrigatório e deve ter pelo menos 16 caracteres")
    .refine((value) => value !== EXAMPLE_JWT_SECRET, {
      message:
        "JWT_SECRET ainda está com o valor de exemplo do .env.example. " +
        "Gere um valor aleatório antes de subir a aplicação.",
    }),
  JWT_EXPIRES_IN: z
    .string()
    .regex(
      /^\d+(ms|s|m|h|d|w|y)$/,
      'JWT_EXPIRES_IN deve seguir o formato "8h", "30m", "1d", etc.',
    )
    .default("8h"),
});

export const env = envSchema.parse(process.env);
export { EXAMPLE_JWT_SECRET, envSchema };

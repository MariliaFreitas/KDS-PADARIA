import { z } from "zod";
import type { UserRole } from "@prisma/client";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Usuário é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Dados do usuário expostos pela API e embutidos no token — nunca inclui
 * passwordHash. Reaproveita o enum UserRole gerado pelo Prisma como fonte
 * única de verdade dos perfis.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
}

import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ErrorCode } from "../../lib/error-codes.js";
import { env } from "../../config/env.js";
import type { AuthenticatedUser, LoginInput, LoginResult } from "./auth.types.js";

/**
 * Mensagem única para toda falha de login (usuário inexistente, senha
 * incorreta, ou usuário inativo). Isso é proposital: revelar qual dessas
 * três coisas aconteceu ajudaria alguém tentando adivinhar credenciais a
 * descobrir se um nome de usuário existe ou não.
 */
const INVALID_CREDENTIALS_MESSAGE = "Usuário ou senha inválidos.";

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (!user || !user.active) {
    throw new AppError(
      INVALID_CREDENTIALS_MESSAGE,
      401,
      ErrorCode.INVALID_CREDENTIALS,
    );
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(
      INVALID_CREDENTIALS_MESSAGE,
      401,
      ErrorCode.INVALID_CREDENTIALS,
    );
  }

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };

  // env.JWT_EXPIRES_IN é validado por zod como string genérica (ex: "8h"),
  // mas o jsonwebtoken espera um formato específico (SignOptions["expiresIn"]).
  // Esta é a tipagem real da biblioteca — não um cast arbitrário para um
  // tipo qualquer.
  const signOptions: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  const token = jwt.sign(authenticatedUser, env.JWT_SECRET, signOptions);

  return { token, user: authenticatedUser };
}

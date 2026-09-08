export type UserRole = "ADMIN" | "ATENDENTE" | "PRODUCAO" | "CAIXA";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { login } from "../auth.service.js";

const baseUser = {
  id: "user-1",
  username: "admin",
  name: "Administrador",
  role: "ADMIN" as const,
  active: true,
  passwordHash: "",
  createdAt: new Date(),
};

describe("auth.service login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("autentica com usuário e senha corretos", async () => {
    const passwordHash = await bcrypt.hash("admin123", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, passwordHash });

    const result = await login({ username: "admin", password: "admin123" });

    expect(result.user.username).toBe("admin");
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
  });

  it("rejeita usuário inexistente", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      login({ username: "ninguem", password: "qualquer" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejeita senha incorreta", async () => {
    const passwordHash = await bcrypt.hash("senha-certa", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, passwordHash });

    await expect(
      login({ username: "admin", password: "senha-errada" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejeita usuário inativo mesmo com a senha correta", async () => {
    const passwordHash = await bcrypt.hash("admin123", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser,
      passwordHash,
      active: false,
    });

    await expect(
      login({ username: "admin", password: "admin123" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("nunca inclui a senha/hash no resultado", async () => {
    const passwordHash = await bcrypt.hash("admin123", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, passwordHash });

    const result = await login({ username: "admin", password: "admin123" });

    expect(result.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });
});

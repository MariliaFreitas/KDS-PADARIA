import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma único (singleton), criado de forma preguiçosa.
 *
 * Duas decisões aqui:
 *
 * 1. O cliente é guardado em globalThis fora de produção. Sem isso, cada
 *    recarga do `tsx watch` e cada arquivo de teste criaria uma conexão nova
 *    com o banco, esgotando o pool durante o desenvolvimento.
 *
 * 2. A instância só é construída no primeiro acesso, não no import do módulo.
 *    Isso desacopla partes da aplicação que não usam banco (ex: GET /health)
 *    da existência do Prisma Client gerado, e permite testá-las isoladamente.
 *
 * Efeito colateral a conhecer: uma DATABASE_URL inválida deixa de falhar no
 * start do processo e passa a falhar na primeira consulta ao banco.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

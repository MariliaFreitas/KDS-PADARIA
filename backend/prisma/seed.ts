import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed mínimo para a Etapa 2.
 *
 * IMPORTANTE: este seed cria SOMENTE o usuário administrador inicial —
 * conforme decidido, nenhum produto, estação, variação ou adicional é
 * inventado aqui. O cadastro real será feito por você, depois que as
 * telas de administração existirem (etapas seguintes).
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Administrador";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
  });

  if (existing) {
    console.log(`Usuário "${ADMIN_USERNAME}" já existe — nada foi alterado.`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      username: ADMIN_USERNAME,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Usuário administrador criado com sucesso.");
  console.log(`  usuário: ${ADMIN_USERNAME}`);
  console.log(
    "  senha: a definida em ADMIN_PASSWORD no seu .env (não exibida aqui por segurança).",
  );
  console.log("IMPORTANTE: troque essa senha assim que possível.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

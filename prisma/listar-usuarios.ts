import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function getUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: getUrl() }),
  });

  console.log('=== USUÁRIOS ===');
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      email: true,
      perfil: true,
      contaAtiva: true,
      workspaceId: true,
    },
    orderBy: { id: 'asc' },
  });
  console.table(usuarios);

  console.log('\n=== WORKSPACES ===');
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, nome: true },
  });
  console.table(workspaces);

    console.log('\n=== NUTRICIONISTAS ===');
  const nutricionistas = await prisma.nutricionista.findMany({
    select: {
      id: true,
      nome: true,
      crn: true,
      usuario: { select: { email: true, workspaceId: true, perfil: true } },
    },
  });
  console.table(nutricionistas);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
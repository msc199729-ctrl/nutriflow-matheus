import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedTbcaAlimentos } from './seed-tbca';

function getDatasourceUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

function requireSeedEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Defina ${name} no ambiente antes de rodar o seed (ex.: no .env ou no painel de deploy).`,
    );
  }
  return v;
}

async function main() {
  const adminEmail = requireSeedEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const adminSenha = requireSeedEnv('SEED_ADMIN_SENHA');

  const connectionString = getDatasourceUrl();
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const senhaHash = await bcrypt.hash(adminSenha, 12);

  const usuario = await prisma.usuario.upsert({
    where: { email: adminEmail },
    update: {
      senhaHash,
      perfil: 'admin_sistema',
      workspaceId: null,
      contaAtiva: true,
    },
    create: {
      email: adminEmail,
      senhaHash,
      perfil: 'admin_sistema',
      workspaceId: null,
      contaAtiva: true,
    },
  });
  console.log('Super administrador:', usuario.email, '(id:', usuario.id, ')');

  await seedTbcaAlimentos(prisma);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

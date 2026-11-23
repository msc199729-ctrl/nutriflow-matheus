import 'dotenv/config';
import * as bcrypt from 'bcrypt';
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
  console.log('URL usada:', getUrl().replace(/:[^:@]+@/, ':***@'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getUrl() }) });

  const total = await prisma.usuario.count();
  console.log('Total de usuarios no banco:', total);

  const u = await prisma.usuario.findUnique({
    where: { email: 'matheus.nutriflow@gmail.com' },
  });

  if (!u) {
    console.log('USUARIO NAO ENCONTRADO aqui. Usuarios existentes:');
    const todos = await prisma.usuario.findMany({ select: { email: true, perfil: true } });
    console.log(todos);
  } else {
    console.log('perfil:', u.perfil);
    console.log('contaAtiva:', u.contaAtiva);
    console.log('bloqueado:', u.bloqueado);
    console.log('workspaceId:', u.workspaceId);
    console.log('senha confere:', await bcrypt.compare('NovaSenha123!', u.senhaHash));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
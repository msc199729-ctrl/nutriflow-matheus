import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const email = process.argv[2];
  const novaSenha = process.argv[3];

  if (!email || !novaSenha) {
    console.error('Uso: npx tsx prisma/reset-senha.ts <email> <nova-senha>');
    process.exit(1);
  }

  const url =
    process.env.DATABASE_URL ??
    `postgresql://${process.env.DB_USER ?? 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'nutriflow'}?schema=public`;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const senhaHash = await bcrypt.hash(novaSenha, 12);

  const u = await prisma.usuario.update({
    where: { email: email.toLowerCase() },
    data: { senhaHash, contaAtiva: true },
  });

  console.log('Senha redefinida:', u.email, '| perfil:', u.perfil, '| ativo:', u.contaAtiva);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
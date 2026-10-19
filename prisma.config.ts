import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';
  const name = process.env.DB_NAME ?? 'nutriflow';
  const encoded = encodeURIComponent(password);
  return `postgresql://${user}:${encoded}@${host}:${port}/${name}?schema=public`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: getDatabaseUrl(),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});

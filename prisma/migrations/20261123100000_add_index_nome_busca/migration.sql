-- Corrige drift: o índice nome_busca existia no banco (criado fora do histórico
-- de migrações) e fazia o `prisma migrate dev` pedir reset do schema.
-- IF NOT EXISTS torna a migração idempotente: no-op se o índice já existir.

CREATE INDEX IF NOT EXISTS "base_alimentos_nome_busca_idx" ON "base_alimentos"("nome_busca");

-- Conversa e mensagem entre paciente e nutricionista.
--
-- O painel web (aba Chat) e o app do paciente já chamavam `/chat/conversas`,
-- `/chat/conversas/:id/mensagens` e `/chat/conversas/:id/lida` — e recebiam 404,
-- porque o módulo nunca existiu no backend. A tela existia dos dois lados e
-- apontava para o vazio.
--
-- Uma conversa por par (paciente, nutricionista): abrir de novo devolve a mesma.
-- Idempotente: o banco de produção pode já ter sido criado à mão.
CREATE TABLE IF NOT EXISTS "conversas" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "id_nutricionista" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversas_id_paciente_id_nutricionista_key"
  ON "conversas"("id_paciente", "id_nutricionista");
CREATE INDEX IF NOT EXISTS "conversas_id_nutricionista_atualizado_em_idx"
  ON "conversas"("id_nutricionista", "atualizado_em");

ALTER TABLE "conversas" DROP CONSTRAINT IF EXISTS "conversas_id_paciente_fkey";
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_id_paciente_fkey"
  FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversas" DROP CONSTRAINT IF EXISTS "conversas_id_nutricionista_fkey";
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_id_nutricionista_fkey"
  FOREIGN KEY ("id_nutricionista") REFERENCES "nutricionistas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mensagens" (
    "id" SERIAL NOT NULL,
    "id_conversa" INTEGER NOT NULL,
    "autor_usuario_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mensagens_id_conversa_criado_em_idx" ON "mensagens"("id_conversa", "criado_em");

ALTER TABLE "mensagens" DROP CONSTRAINT IF EXISTS "mensagens_id_conversa_fkey";
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_id_conversa_fkey"
  FOREIGN KEY ("id_conversa") REFERENCES "conversas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Token de push (Expo) por aparelho do paciente.
--
-- Sem esta tabela o app registrava o token em `POST /notifications/device-token`
-- e recebia 404: o push nunca saía, e o erro era engolido no catch do app.
--
-- `token` é ÚNICO: o mesmo aparelho trocando de conta reatribui o token ao novo
-- paciente em vez de acumular linhas, e o token antigo deixa de valer.
-- Idempotente porque o banco de produção pode já ter sido ajustado à mão.
CREATE TABLE IF NOT EXISTS "dispositivos_push" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "plataforma" VARCHAR(20),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivos_push_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dispositivos_push_token_key" ON "dispositivos_push"("token");
CREATE INDEX IF NOT EXISTS "dispositivos_push_id_paciente_idx" ON "dispositivos_push"("id_paciente");

ALTER TABLE "dispositivos_push" DROP CONSTRAINT IF EXISTS "dispositivos_push_id_paciente_fkey";
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_id_paciente_fkey"
  FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

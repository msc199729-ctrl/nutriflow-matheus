-- Caixa de entrada do paciente no app.
--
-- Até aqui o único canal para avisar o paciente era o nutricionista abrir o
-- WhatsApp e mandar um link para o navegador. Notificação é dado persistido,
-- não mensagem que se perde: o paciente abre o app e vê o que chegou.
--
-- `lida_em` nulo = não lida. Guardamos a data, e não um booleano, para poder
-- ordenar pelo que o paciente deixou de ver e medir se o aviso serviu.
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "id_referencia" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TIMESTAMP(3),

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- A consulta real é "as notificações deste paciente, mais novas primeiro".
CREATE INDEX "notificacoes_id_paciente_criado_em_idx" ON "notificacoes"("id_paciente", "criado_em");

ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_id_paciente_fkey"
  FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

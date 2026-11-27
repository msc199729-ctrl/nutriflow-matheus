-- Fila de pendências e "explicação obrigatória" no check-in.
--
-- `revisado_em` no envio: o nutricionista precisa marcar o que já leu. Sem isso
-- a única visão é uma lista de 25 envios e ele relê os mesmos três toda semana.
-- A data (e não um booleano) permite medir quanto tempo uma resposta esperou.
--
-- `explicacao` na resposta: quando a alternativa escolhida é a ruim, o paciente
-- é obrigado a dizer por quê. É o substituto barato da lógica condicional —
-- o mesmo caminho que o LiveClin usa.
--
-- Idempotente de propósito: `prisma migrate deploy` roda em produção e uma
-- coluna criada à mão antes derrubaria a fila com 42701.
ALTER TABLE "envios_formulario"
  ADD COLUMN IF NOT EXISTS "revisado_em" TIMESTAMP(3);

ALTER TABLE "respostas"
  ADD COLUMN IF NOT EXISTS "explicacao" TEXT;

-- Fila de pendências: "deste paciente, respondido e ainda não revisado".
CREATE INDEX IF NOT EXISTS "envios_formulario_id_paciente_revisado_em_idx"
  ON "envios_formulario"("id_paciente", "revisado_em");

-- Recorrência: o último envio de cada paciente dentro de um modelo.
CREATE INDEX IF NOT EXISTS "envios_formulario_id_modelo_enviado_em_idx"
  ON "envios_formulario"("id_modelo", "enviado_em");

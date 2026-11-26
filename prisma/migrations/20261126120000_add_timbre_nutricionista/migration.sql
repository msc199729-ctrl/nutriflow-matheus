-- Campos do timbre dos documentos, por nutricionista.
--
-- O model `Nutricionista` já tinha `nome`, `crn` e `tipo_conselho`; faltavam
-- os quatro campos abaixo para o documento sair no timbre de quem emite.
-- Todos são opcionais (NULL): contas antigas continuam funcionando e os
-- documentos usam os fallbacks do ProfissionalService.

ALTER TABLE "nutricionistas" ADD COLUMN IF NOT EXISTS "especialidade" VARCHAR(120);
ALTER TABLE "nutricionistas" ADD COLUMN IF NOT EXISTS "cidade" VARCHAR(120);
ALTER TABLE "nutricionistas" ADD COLUMN IF NOT EXISTS "logo_url" VARCHAR(255);
ALTER TABLE "nutricionistas" ADD COLUMN IF NOT EXISTS "instagram" VARCHAR(120);

COMMENT ON COLUMN "nutricionistas"."especialidade" IS 'Titulação exibida sob o nome (ex.: Nutricionista Clínico Esportivo).';
COMMENT ON COLUMN "nutricionistas"."cidade" IS 'Cidade usada na data de assinatura dos documentos.';
COMMENT ON COLUMN "nutricionistas"."logo_url" IS 'Caminho do logo enviado em /uploads/timbre/ (ou URL absoluta).';
COMMENT ON COLUMN "nutricionistas"."instagram" IS 'Perfil exibido no rodapé dos documentos (opcional).';

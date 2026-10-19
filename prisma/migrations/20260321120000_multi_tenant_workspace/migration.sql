-- CreateTable
CREATE TABLE "workspaces" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "status_assinatura" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- Dados existentes: um workspace padrão
INSERT INTO "workspaces" ("id", "nome", "documento", "status_assinatura")
VALUES (1, 'Clínica padrão', NULL, 'Ativo');

-- Select setval so próximo insert não colide
SELECT setval(pg_get_serial_sequence('workspaces', 'id'), (SELECT MAX("id") FROM "workspaces"));

-- Usuários: coluna tenant (nullable para admin_sistema)
ALTER TABLE "usuarios" ADD COLUMN "id_workspace" INTEGER;

UPDATE "usuarios" SET "id_workspace" = 1 WHERE "id_workspace" IS NULL;

-- Novo enum de perfil
CREATE TYPE "perfil_usuario_new" AS ENUM ('nutricionista', 'paciente', 'admin_clinica', 'admin_sistema');

ALTER TABLE "usuarios" ALTER COLUMN "perfil" TYPE "perfil_usuario_new" USING (
  CASE "perfil"::text
    WHEN 'admin' THEN 'admin_sistema'::perfil_usuario_new
    WHEN 'nutricionista' THEN 'nutricionista'::perfil_usuario_new
    WHEN 'paciente' THEN 'paciente'::perfil_usuario_new
    ELSE 'paciente'::perfil_usuario_new
  END
);

DROP TYPE "perfil_usuario";
ALTER TYPE "perfil_usuario_new" RENAME TO "perfil_usuario";

UPDATE "usuarios" SET "id_workspace" = NULL WHERE "perfil" = 'admin_sistema';

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_workspace_fkey" FOREIGN KEY ("id_workspace") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "usuarios_id_workspace_idx" ON "usuarios"("id_workspace");

-- Pacientes: workspace obrigatório
ALTER TABLE "pacientes" ADD COLUMN "id_workspace" INTEGER;

UPDATE "pacientes" p
SET "id_workspace" = u."id_workspace"
FROM "usuarios" u
WHERE u."id" = p."id";

UPDATE "pacientes" SET "id_workspace" = 1 WHERE "id_workspace" IS NULL;

ALTER TABLE "pacientes" ALTER COLUMN "id_workspace" SET NOT NULL;

ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_id_workspace_fkey" FOREIGN KEY ("id_workspace") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "pacientes_id_workspace_idx" ON "pacientes"("id_workspace");

-- Modelos de formulário: por workspace (antes por nutricionista)
ALTER TABLE "modelos_formulario" ADD COLUMN "id_workspace" INTEGER;

UPDATE "modelos_formulario" m
SET "id_workspace" = u."id_workspace"
FROM "nutricionistas" n
INNER JOIN "usuarios" u ON u."id" = n."id"
WHERE m."id_nutricionista" = n."id";

UPDATE "modelos_formulario" SET "id_workspace" = 1 WHERE "id_workspace" IS NULL;

ALTER TABLE "modelos_formulario" ALTER COLUMN "id_workspace" SET NOT NULL;

ALTER TABLE "modelos_formulario" DROP CONSTRAINT "modelos_formulario_id_nutricionista_fkey";

ALTER TABLE "modelos_formulario" DROP COLUMN "id_nutricionista";

ALTER TABLE "modelos_formulario" ADD CONSTRAINT "modelos_formulario_id_workspace_fkey" FOREIGN KEY ("id_workspace") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "modelos_formulario_id_workspace_idx" ON "modelos_formulario"("id_workspace");

-- status_assinatura migrou conceitualmente para workspace
ALTER TABLE "nutricionistas" DROP COLUMN "status_assinatura";

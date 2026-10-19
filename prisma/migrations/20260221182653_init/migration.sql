-- CreateEnum
CREATE TYPE "perfil_usuario" AS ENUM ('admin', 'nutricionista', 'paciente');

-- CreateEnum
CREATE TYPE "origem_dado" AS ENUM ('busca_manual', 'scanner_codigo_barras', 'reconhecimento_ocr');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "perfil_usuario" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutricionistas" (
    "id" INTEGER NOT NULL,
    "nome" TEXT,
    "crn" TEXT,
    "status_assinatura" TEXT,

    CONSTRAINT "nutricionistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" INTEGER NOT NULL,
    "id_nutricionista" INTEGER NOT NULL,
    "nome" TEXT,
    "data_nascimento" DATE,
    "genero" TEXT,
    "objetivo" TEXT,
    "notas_clinicas" TEXT,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_fisicas" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "data" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "peso" DOUBLE PRECISION,
    "altura" DOUBLE PRECISION,
    "imc" DOUBLE PRECISION,
    "classificacao_imc" TEXT,
    "rcq" DOUBLE PRECISION,
    "risco_metabolico_rcq" TEXT,
    "percentual_gordura" DOUBLE PRECISION,
    "classificacao_gordura" TEXT,
    "massa_gordura_kg" DOUBLE PRECISION,
    "massa_livre_gordura_kg" DOUBLE PRECISION,
    "massa_residual_kg" DOUBLE PRECISION,
    "massa_muscular_kg" DOUBLE PRECISION,
    "somatorio_dobras_mm" DOUBLE PRECISION,
    "bia_percentual_gordura" DOUBLE PRECISION,
    "bia_classificacao_gordura" TEXT,
    "bia_percentual_massa_muscular" DOUBLE PRECISION,
    "bia_massa_muscular_kg" DOUBLE PRECISION,
    "bia_agua_corporal_total_kg" DOUBLE PRECISION,
    "bia_massa_ossea_kg" DOUBLE PRECISION,
    "bia_indice_gordura_visceral" DOUBLE PRECISION,
    "bia_idade_metabolica" INTEGER,
    "dobra_tricipital" DOUBLE PRECISION,
    "dobra_abdominal" DOUBLE PRECISION,
    "dobra_suprailiaca" DOUBLE PRECISION,
    "circ_torax" DOUBLE PRECISION,
    "circ_ombro" DOUBLE PRECISION,
    "circ_cintura" DOUBLE PRECISION,
    "circ_abdomen" DOUBLE PRECISION,
    "circ_quadril" DOUBLE PRECISION,
    "circ_braco_relaxado" DOUBLE PRECISION,
    "circ_braco_contraido" DOUBLE PRECISION,
    "circ_braco_cmb" DOUBLE PRECISION,
    "circ_antebraco" DOUBLE PRECISION,
    "circ_coxa_proximal" DOUBLE PRECISION,
    "circ_coxa_medial" DOUBLE PRECISION,
    "circ_coxa_distal" DOUBLE PRECISION,
    "circ_panturrilha" DOUBLE PRECISION,
    "url_foto_frente" TEXT,
    "url_foto_costas" TEXT,
    "url_foto_lado" TEXT,

    CONSTRAINT "avaliacoes_fisicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_alimentos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo_barras" TEXT,
    "fonte" TEXT,
    "calorias" DOUBLE PRECISION,
    "proteinas" DOUBLE PRECISION,
    "carboidratos" DOUBLE PRECISION,
    "gorduras" DOUBLE PRECISION,
    "fibras" DOUBLE PRECISION,
    "sodio" DOUBLE PRECISION,
    "eh_ultraprocessado" BOOLEAN NOT NULL DEFAULT false,
    "score_nova" INTEGER,

    CONSTRAINT "base_alimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_alimentares" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "id_nutricionista" INTEGER NOT NULL,
    "nome" TEXT,
    "data_inicio" DATE,
    "data_fim" DATE,
    "ativo" BOOLEAN,
    "meta_agua_litros" DOUBLE PRECISION,

    CONSTRAINT "planos_alimentares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refeicoes_planejadas" (
    "id" SERIAL NOT NULL,
    "id_plano_alimentar" INTEGER NOT NULL,
    "nome" TEXT,
    "horario_sugerido" TIME,

    CONSTRAINT "refeicoes_planejadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_dieta" (
    "id" SERIAL NOT NULL,
    "id_refeicao_planejada" INTEGER NOT NULL,
    "id_alimento" INTEGER NOT NULL,
    "quantidade_gramas" DOUBLE PRECISION,
    "id_grupo_substituicao" INTEGER,

    CONSTRAINT "itens_dieta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_diarios" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "registrado_em" TIMESTAMP(3),
    "tipo_refeicao" TEXT,
    "url_foto_prato" TEXT,
    "ingestao_agua_ml" INTEGER,

    CONSTRAINT "registros_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_consumidos" (
    "id" SERIAL NOT NULL,
    "id_registro" INTEGER NOT NULL,
    "id_alimento" INTEGER NOT NULL,
    "quantidade_consumida" DOUBLE PRECISION,
    "origem" "origem_dado",

    CONSTRAINT "itens_consumidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_formulario" (
    "id" SERIAL NOT NULL,
    "id_nutricionista" INTEGER NOT NULL,
    "titulo" TEXT,
    "frequencia_dias" INTEGER,

    CONSTRAINT "modelos_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perguntas" (
    "id" SERIAL NOT NULL,
    "id_modelo" INTEGER NOT NULL,
    "texto_pergunta" TEXT,
    "tipo_resposta" TEXT,
    "tag_analise" TEXT,

    CONSTRAINT "perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_formulario" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "id_modelo" INTEGER NOT NULL,
    "enviado_em" TIMESTAMP(3),
    "respondido_em" TIMESTAMP(3),
    "status" TEXT,

    CONSTRAINT "envios_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas" (
    "id" SERIAL NOT NULL,
    "id_envio" INTEGER NOT NULL,
    "id_pergunta" INTEGER NOT NULL,
    "valor_resposta" TEXT,

    CONSTRAINT "respostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analises_ia" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3),
    "tipo_analise" TEXT,
    "snapshot_prompt" TEXT,
    "resposta_bruta" TEXT,
    "dados_estruturados" JSONB,

    CONSTRAINT "analises_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "base_alimentos_codigo_barras_key" ON "base_alimentos"("codigo_barras");

-- AddForeignKey
ALTER TABLE "nutricionistas" ADD CONSTRAINT "nutricionistas_id_fkey" FOREIGN KEY ("id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_id_fkey" FOREIGN KEY ("id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_id_nutricionista_fkey" FOREIGN KEY ("id_nutricionista") REFERENCES "nutricionistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_fisicas" ADD CONSTRAINT "avaliacoes_fisicas_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_alimentares" ADD CONSTRAINT "planos_alimentares_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_alimentares" ADD CONSTRAINT "planos_alimentares_id_nutricionista_fkey" FOREIGN KEY ("id_nutricionista") REFERENCES "nutricionistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refeicoes_planejadas" ADD CONSTRAINT "refeicoes_planejadas_id_plano_alimentar_fkey" FOREIGN KEY ("id_plano_alimentar") REFERENCES "planos_alimentares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_dieta" ADD CONSTRAINT "itens_dieta_id_refeicao_planejada_fkey" FOREIGN KEY ("id_refeicao_planejada") REFERENCES "refeicoes_planejadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_dieta" ADD CONSTRAINT "itens_dieta_id_alimento_fkey" FOREIGN KEY ("id_alimento") REFERENCES "base_alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_diarios" ADD CONSTRAINT "registros_diarios_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_consumidos" ADD CONSTRAINT "itens_consumidos_id_registro_fkey" FOREIGN KEY ("id_registro") REFERENCES "registros_diarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_consumidos" ADD CONSTRAINT "itens_consumidos_id_alimento_fkey" FOREIGN KEY ("id_alimento") REFERENCES "base_alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_formulario" ADD CONSTRAINT "modelos_formulario_id_nutricionista_fkey" FOREIGN KEY ("id_nutricionista") REFERENCES "nutricionistas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perguntas" ADD CONSTRAINT "perguntas_id_modelo_fkey" FOREIGN KEY ("id_modelo") REFERENCES "modelos_formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_id_modelo_fkey" FOREIGN KEY ("id_modelo") REFERENCES "modelos_formulario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas" ADD CONSTRAINT "respostas_id_envio_fkey" FOREIGN KEY ("id_envio") REFERENCES "envios_formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas" ADD CONSTRAINT "respostas_id_pergunta_fkey" FOREIGN KEY ("id_pergunta") REFERENCES "perguntas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_ia" ADD CONSTRAINT "analises_ia_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

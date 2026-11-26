import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Dados do timbre que o nutricionista logado pode editar.
 * `nome`, `crn` e `tipoConselho` também são editáveis aqui, porque é comum
 * corrigir o número do conselho logo depois do cadastro.
 */
export class AtualizarPerfilProfissionalDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  especialidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  crn?: string;

  @IsOptional()
  @Matches(/^(crn|crm)$/i, { message: 'tipoConselho deve ser crn ou crm' })
  tipoConselho?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagram?: string;
}

/** Resposta do perfil: o que o front mostra na tela de configurações. */
export interface PerfilProfissionalResposta {
  id: number;
  nome: string;
  especialidade: string;
  conselhoTipo: string;
  conselhoNumero: string;
  cidade: string;
  logoUrl: string | null;
  instagram: string | null;
  /** URL pública do logo para o <img src> do front. */
  logoUrlPublica: string | null;
}

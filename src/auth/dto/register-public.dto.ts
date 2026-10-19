import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PLANOS_SAAS, type PlanoSaasCode } from '../../common/saas-billing.util';

export class RegisterPublicDto {
  @ApiProperty({ example: 'usuario@email.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  senha: string;

  @ApiProperty({ description: 'Nome completo (usado na análise do cadastro)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Informe o nome com pelo menos 2 caracteres' })
  nome: string;

  @ApiProperty({
    description:
      'Número do registro no conselho (CRN ou CRM), usado na aprovação. Combine com `tipoConselho`.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Informe o número do conselho (CRN ou CRM)' })
  crn: string;

  @ApiPropertyOptional({
    enum: ['crn', 'crm'],
    default: 'crn',
    description:
      'Tipo do conselho do número em `crn`. Omitir = nutricionista (CRN). Use `crm` para nutrólogo(a) com CRM.',
  })
  @IsOptional()
  @IsIn(['crn', 'crm'])
  tipoConselho?: 'crn' | 'crm';

  @ApiProperty({
    enum: PLANOS_SAAS,
    description: 'Plano de assinatura do SaaS (sem cobrança online — controle interno e vencimento).',
  })
  @IsIn([...PLANOS_SAAS])
  planoSaas: PlanoSaasCode;

  @ApiProperty({
    description: 'Dia do mês (1–28) em que vence a mensalidade.',
    minimum: 1,
    maximum: 28,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimentoSaas: number;

  @ApiPropertyOptional({
    description:
      'Nome da clínica (opcional). Ajuda o super administrador a criar ou vincular o workspace correto na aprovação.',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  nomeClinicaCadastro?: string;

  @ApiPropertyOptional({
    description: 'CNPJ da clínica (opcional), texto livre; o super administrador usa na análise do cadastro.',
    maxLength: 32,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(32)
  cnpjClinicaCadastro?: string;
}

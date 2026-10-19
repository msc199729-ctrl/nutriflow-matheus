import { ApiProperty } from '@nestjs/swagger';

export class NutricionistaListItemDto {
  @ApiProperty()
  id: number;
  @ApiProperty()
  email: string;
  @ApiProperty({ nullable: true })
  nome: string | null;
  @ApiProperty({ nullable: true })
  crn: string | null;
  @ApiProperty({ enum: ['crn', 'crm'], description: 'Conselho do número em `crn`' })
  tipoConselho: 'crn' | 'crm';
  @ApiProperty({ nullable: true, description: 'Ausente até o super admin vincular workspace (cadastro público pendente).' })
  workspaceId: number | null;
  @ApiProperty({ description: 'Nome do workspace ou traço se ainda não vinculado' })
  workspaceNome: string;
  @ApiProperty({ nullable: true, description: 'Nome da clínica informado no cadastro público (opcional)' })
  nomeClinicaCadastro: string | null;
  @ApiProperty({ nullable: true, description: 'CNPJ da clínica informado no cadastro público (opcional)' })
  cnpjClinicaCadastro: string | null;
  @ApiProperty({ nullable: true })
  statusAssinatura: string | null;
  @ApiProperty()
  bloqueado: boolean;
  @ApiProperty({
    description: 'false para nutricionistas que se cadastraram e ainda não foram aprovados',
  })
  contaAtiva: boolean;
  @ApiProperty()
  criadoEm: Date;

  @ApiProperty({ nullable: true, description: 'Plano SaaS (basico, profissional, clinica)' })
  planoSaas: string | null;

  @ApiProperty({ nullable: true, description: 'Dia do mês (1–28) do vencimento' })
  diaVencimentoSaas: number | null;

  @ApiProperty({ nullable: true, description: 'Próximo vencimento da mensalidade (data)' })
  proximoVencimentoSaas: string | null;

  @ApiProperty({ nullable: true })
  ultimoPagamentoSaasEm: string | null;

  @ApiProperty({
    description:
      'Conta ativa e data de vencimento já passou — acesso do nutricionista suspenso até pagamento registrado.',
  })
  assinaturaSaasEmAtraso: boolean;
}

export class ListNutricionistasResponseDto {
  @ApiProperty({ type: [NutricionistaListItemDto] })
  items: NutricionistaListItemDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
  @ApiProperty()
  totalPages: number;
}

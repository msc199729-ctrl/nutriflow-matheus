export type TipoCampo = 'texto' | 'data' | 'hora' | 'numero' | 'textarea';

export interface CampoModelo {
  nome: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  valorPadrao?: string;
  ajuda?: string;
}

export interface ModeloDocumento {
  chave: string;
  titulo: string;
  tipo: 'atestado' | 'recibo' | 'livre';
  descricao: string;
  campos: CampoModelo[];
}

/**
 * Modelos de documento do painel. O campo `cidade` não traz valor fixo:
 * em branco, a assinatura usa a cidade do perfil do nutricionista logado.
 */
export const MODELOS: ModeloDocumento[] = [
  {
    chave: 'atestado_onutri',
    titulo: 'Atestado de comparecimento padrão Onutri',
    tipo: 'atestado',
    descricao:
      'Declara que o paciente compareceu ao atendimento, com data, horário e finalidade.',
    campos: [
      { nome: 'data', rotulo: 'Data do atendimento', tipo: 'data', obrigatorio: true },
      { nome: 'horaInicio', rotulo: 'Hora de início', tipo: 'hora', obrigatorio: true, valorPadrao: '14:00' },
      { nome: 'horaFim', rotulo: 'Hora de término', tipo: 'hora', obrigatorio: true, valorPadrao: '15:30' },
      {
        nome: 'finalidade',
        rotulo: 'Finalidade do atendimento',
        tipo: 'textarea',
        obrigatorio: true,
        valorPadrao:
          'consulta de avaliação nutricional, antropometria, análise de composição corporal e prescrição dietoterápica individualizada',
      },
      {
        nome: 'observacoes',
        rotulo: 'Observações',
        tipo: 'textarea',
        obrigatorio: false,
        ajuda: 'Deixe em branco para omitir o parágrafo.',
      },
      {
        nome: 'cidade',
        rotulo: 'Cidade',
        tipo: 'texto',
        obrigatorio: false,
        ajuda: 'Em branco usa a cidade do seu perfil.',
      },
    ],
  },
  {
    chave: 'recibo_onutri',
    titulo: 'Recibo de pagamento padrão Onutri',
    tipo: 'recibo',
    descricao:
      'Recibo de prestação de serviços com valor, descrição, forma de pagamento e vigência.',
    campos: [
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'numero', obrigatorio: true },
      {
        nome: 'meses',
        rotulo: 'Duração do acompanhamento (meses)',
        tipo: 'numero',
        obrigatorio: true,
        valorPadrao: '3',
      },
      {
        nome: 'descricao',
        rotulo: 'Descrição do serviço',
        tipo: 'textarea',
        obrigatorio: false,
        ajuda: 'Se vazio, usa a descrição padrão de acompanhamento nutricional.',
      },
      {
        nome: 'formaPagamento',
        rotulo: 'Forma de pagamento',
        tipo: 'texto',
        obrigatorio: true,
        valorPadrao: 'PIX',
      },
      { nome: 'vigenciaInicio', rotulo: 'Início da vigência', tipo: 'data', obrigatorio: true },
      { nome: 'vigenciaFim', rotulo: 'Fim da vigência', tipo: 'data', obrigatorio: true },
      {
        nome: 'cidade',
        rotulo: 'Cidade',
        tipo: 'texto',
        obrigatorio: false,
        ajuda: 'Em branco usa a cidade do seu perfil.',
      },
    ],
  },
  {
    chave: 'livre',
    titulo: 'Documento próprio',
    tipo: 'livre',
    descricao: 'Texto livre com o cabeçalho do profissional e bloco de assinatura.',
    campos: [
      { nome: 'titulo', rotulo: 'Título do documento', tipo: 'texto', obrigatorio: true },
      { nome: 'corpo', rotulo: 'Conteúdo', tipo: 'textarea', obrigatorio: true },
      {
        nome: 'cidade',
        rotulo: 'Cidade',
        tipo: 'texto',
        obrigatorio: false,
        ajuda: 'Em branco usa a cidade do seu perfil.',
      },
      { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
    ],
  },
];

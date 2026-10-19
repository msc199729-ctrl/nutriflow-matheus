import { ApiProperty } from '@nestjs/swagger';

export class RegisterPendingResponseDto {
  @ApiProperty({
    description: 'Cadastro recebido; o nutricionista só poderá entrar após aprovação do super administrador.',
  })
  message: string;

  @ApiProperty({ description: 'Indica que não há token até a conta ser aprovada' })
  pendenteAprovacao: boolean;
}

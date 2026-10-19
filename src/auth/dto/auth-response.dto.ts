import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT de acesso' })
  access_token: string;

  @ApiProperty({ description: 'Tipo do token' })
  token_type: string;

  @ApiProperty({ description: 'Tempo de expiração em segundos' })
  expires_in: number;
}

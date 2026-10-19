import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkspaceListItemDto {
  @ApiProperty()
  id: number;
  @ApiProperty()
  nome: string;
  @ApiPropertyOptional({ nullable: true })
  documento: string | null;
  @ApiPropertyOptional({ nullable: true })
  statusAssinatura: string | null;
  @ApiProperty()
  criadoEm: Date;
}

export class ListWorkspacesResponseDto {
  @ApiProperty({ type: [WorkspaceListItemDto] })
  items: WorkspaceListItemDto[];
}

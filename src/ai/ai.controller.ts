import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ResumoClinicoDto } from './dto/resumo-clinico.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('IA')
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('analises')
  @ApiResponse({ status: 200, description: 'Lista de análises IA do nutricionista/paciente' })
  findAllAnalises(@CurrentUser() user: JwtPayloadUser) {
    return this.aiService.findAllAnalises(user);
  }

  @Post('resumo-clinico')
  @ApiResponse({ status: 201, description: 'Análise criada (resposta bruta e dados estruturados em analises_ia)' })
  @ApiResponse({ status: 403, description: 'Paciente não vinculado ao nutricionista' })
  gerarResumoClinico(
    @Body() dto: ResumoClinicoDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.aiService.gerarResumoClinico(dto.idPaciente, user);
  }
}

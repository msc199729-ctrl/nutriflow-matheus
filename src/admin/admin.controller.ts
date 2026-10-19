import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminStatsDto } from './dto/admin-stats.dto';
import { CreateNutricionistaAdminDto } from './dto/create-nutricionista-admin.dto';
import { CreateNutricionistaAdminResponseDto } from './dto/create-nutricionista-admin-response.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { ListNutricionistasQueryDto } from './dto/list-nutricionistas-query.dto';
import { ListNutricionistasResponseDto } from './dto/nutricionista-list-item.dto';
import { PatchNutricionistaDto } from './dto/patch-nutricionista.dto';
import { ListWorkspacesResponseDto } from './dto/workspace-list-item.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PerfilUsuario, TipoConselho } from '@prisma/client';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(PerfilUsuario.admin_sistema)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiResponse({ status: 200, description: 'Estatísticas do painel admin', type: AdminStatsDto })
  @ApiResponse({ status: 403, description: 'Apenas admin' })
  getStats(): Promise<AdminStatsDto> {
    return this.adminService.getStats();
  }

  @Get('workspaces')
  @ApiResponse({ status: 200, description: 'Lista de workspaces', type: ListWorkspacesResponseDto })
  listWorkspaces(): Promise<ListWorkspacesResponseDto> {
    return this.adminService.listWorkspaces();
  }

  @Post('workspaces')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreateWorkspaceDto })
  @ApiResponse({ status: 201, description: 'Workspace criado' })
  createWorkspace(@Body() dto: CreateWorkspaceDto) {
    return this.adminService.createWorkspace(dto);
  }

  @Get('nutricionistas')
  @ApiResponse({ status: 200, description: 'Lista paginada de nutricionistas', type: ListNutricionistasResponseDto })
  @ApiResponse({ status: 403, description: 'Apenas admin' })
  listNutricionistas(
    @Query() query: ListNutricionistasQueryDto,
  ): Promise<ListNutricionistasResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const tipoConselho =
      query.tipoConselho === 'crm'
        ? TipoConselho.crm
        : query.tipoConselho === 'crn'
          ? TipoConselho.crn
          : undefined;
    return this.adminService.listNutricionistas(page, limit, {
      busca: query.busca,
      tipoConselho,
    });
  }

  @Post('nutricionistas')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreateNutricionistaAdminDto })
  @ApiResponse({
    status: 201,
    description: 'Nutricionista criado no workspace indicado',
    type: CreateNutricionistaAdminResponseDto,
  })
  createNutricionista(@Body() dto: CreateNutricionistaAdminDto) {
    return this.adminService.createNutricionista(dto);
  }

  @Patch('nutricionistas/:id')
  @ApiBody({ type: PatchNutricionistaDto })
  @ApiResponse({
    status: 200,
    description: 'Campos atualizados (bloqueio e/ou ativação da conta)',
  })
  @ApiResponse({ status: 403, description: 'Apenas admin' })
  @ApiResponse({ status: 404, description: 'Nutricionista não encontrado' })
  patchNutricionista(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchNutricionistaDto,
  ) {
    return this.adminService.patchNutricionistaUsuario(id, dto);
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterPublicDto } from './dto/register-public.dto';
import { RegisterPendingResponseDto } from './dto/register-pending-response.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiBody({ type: RegisterPublicDto })
  @ApiResponse({
    status: 201,
    description:
      'Nutricionista cadastrado (conta inativa até aprovação do super administrador; sem token JWT)',
    type: RegisterPendingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado' })
  async register(@Body() dto: RegisterPublicDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login realizado', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'E-mail ou senha incorretos' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.senha);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Dados do usuário autenticado' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async me(@CurrentUser() user: JwtPayloadUser) {
    return this.authService.getMePayload(user);
  }
}

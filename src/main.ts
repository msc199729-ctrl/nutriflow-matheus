import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Garante DATABASE_URL para o Prisma Client quando só existem DB_* no .env
if (!process.env.DATABASE_URL && process.env.DB_HOST) {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const pwd = encodeURIComponent(DB_PASSWORD ?? '');
  process.env.DATABASE_URL = `postgresql://${DB_USER ?? 'postgres'}:${pwd}@${DB_HOST}:${DB_PORT ?? '5432'}/${DB_NAME ?? 'nutriflow'}?schema=public`;
}

async function bootstrap() {
  const pacienteFotoDir = join(process.cwd(), 'uploads', 'paciente-perfil');
  if (!existsSync(pacienteFotoDir)) {
    mkdirSync(pacienteFotoDir, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(pacienteFotoDir, { prefix: '/static/paciente-perfil/' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('NutriFlow API')
    .setDescription(
      'API RESTful do ecossistema NutriFlow - gestão nutricional (painel web e app mobile).',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureHttpApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  const prefix = configureHttpApp(app);
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('BimaPlacement API')
    .setDescription('Placement Automation Platform - RFQ, insurer threads, quotes, QCR (PRD v1.7)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc));

  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();

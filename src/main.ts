import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody:    true,   // exposes req.rawBody as Buffer — required for Stripe webhook signature verification
  });

  // ConfigService — validated by Joi at module init, so all get() calls are safe
  const config       = app.get(ConfigService);
  const PORT         = config.get<number>('PORT');
  const FRONTEND_URL = config.get<string>('FRONTEND_URL');

  // Use Winston as the app-wide logger (replaces NestJS default)
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: [FRONTEND_URL as string],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Input sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — consistent JSON error shape on every error
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  // Request/response logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  // Graceful shutdown — handles SIGTERM/SIGINT cleanly (disconnects Prisma, etc.)
  app.enableShutdownHooks();

  await app.listen(PORT as number);
  logger.log(`Application running on port ${PORT}`, 'Bootstrap');
}
bootstrap();

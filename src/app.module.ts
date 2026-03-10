import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { envValidationSchema } from './config/env.validation';
import { UserModule } from './modules/user/user.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { LeadModule } from './modules/lead/lead.module';
import { LeadNoteModule } from './modules/lead-note/lead-note.module';
import { TagModule } from './modules/tag/tag.module';
import { TeamModule } from './modules/team/team.module';
import { BillingModule } from './modules/billing/billing.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { HealthModule } from './modules/health/health.module';

const winstonConfig: winston.LoggerOptions = {
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${extra}`;
        }),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
};

@Module({
  imports: [
    // MUST be first — validates all env vars before any other module initializes
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    WinstonModule.forRoot(winstonConfig),
    // Global rate limiting: 100 req/min general, 5 req/min on auth routes
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60_000, limit: 100 },
      { name: 'auth',   ttl: 60_000, limit: 5   },
    ]),
    PrismaModule,
    AuditLogModule,
    UserModule,
    AuthModule,
    LeadModule,
    LeadNoteModule,
    TagModule,
    TeamModule,
    BillingModule,
    ApiKeyModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

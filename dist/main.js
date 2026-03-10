"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const nest_winston_1 = require("nest-winston");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: true });
    // ConfigService — validated by Joi at module init, so all get() calls are safe
    const config = app.get(config_1.ConfigService);
    const PORT = config.get('PORT');
    const FRONTEND_URL = config.get('FRONTEND_URL');
    // Use Winston as the app-wide logger (replaces NestJS default)
    const logger = app.get(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER);
    app.useLogger(logger);
    // Security headers
    app.use((0, helmet_1.default)());
    // CORS
    app.enableCors({
        origin: [FRONTEND_URL],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
    // Input sanitization
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    // Global exception filter — consistent JSON error shape on every error
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter(logger));
    // Request/response logging interceptor
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor(logger));
    // Graceful shutdown — handles SIGTERM/SIGINT cleanly (disconnects Prisma, etc.)
    app.enableShutdownHooks();
    await app.listen(PORT);
    logger.log(`Application running on port ${PORT}`, 'Bootstrap');
}
bootstrap();

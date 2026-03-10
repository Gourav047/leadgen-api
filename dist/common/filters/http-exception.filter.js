"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const nest_winston_1 = require("nest-winston");
let HttpExceptionFilter = class HttpExceptionFilter {
    constructor(logger) {
        this.logger = logger;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let statusCode = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'Internal Server Error';
        if (exception instanceof common_1.HttpException) {
            statusCode = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
                error = res;
            }
            else if (typeof res === 'object' && res !== null) {
                const resObj = res;
                message = resObj.message ?? message;
                error = resObj.error ?? error;
            }
        }
        else {
            // Unexpected error — log full stack, return safe generic message
            this.logger.error('Unhandled exception', {
                stack: exception instanceof Error ? exception.stack : String(exception),
                path: request.url,
                method: request.method,
            });
        }
        const body = {
            statusCode,
            message,
            error,
            timestamp: new Date().toISOString(),
            path: request.url,
        };
        if (statusCode >= 500) {
            this.logger.error(`${request.method} ${request.url} → ${statusCode}`, body);
        }
        else if (statusCode >= 400) {
            this.logger.warn(`${request.method} ${request.url} → ${statusCode}`, { message });
        }
        response.status(statusCode).json(body);
    }
};
HttpExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __param(0, (0, common_1.Inject)(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER)),
    __metadata("design:paramtypes", [Object])
], HttpExceptionFilter);
exports.HttpExceptionFilter = HttpExceptionFilter;

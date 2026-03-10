"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const client_1 = require("@prisma/client");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async signup(dto) {
        const existing = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existing) {
            throw new common_1.BadRequestException('Email already exists');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: { name: dto.companyName },
            });
            const newUser = await tx.user.create({
                data: {
                    username: dto.username,
                    email: dto.email,
                    password: hashedPassword,
                    tenantId: tenant.id,
                    role: 'OWNER',
                },
            });
            await tx.auditLog.create({
                data: {
                    actorId: null,
                    actorRole: null,
                    action: client_1.AuditAction.TENANT_CREATED,
                    entityType: 'Tenant',
                    entityId: tenant.id,
                    tenantId: tenant.id,
                    changes: { before: null, after: { tenantName: dto.companyName, ownerEmail: dto.email } },
                },
            });
            return newUser;
        });
        const { password, ...safeUser } = user;
        return safeUser;
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        // Always show the same error — don't reveal whether the email exists
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new common_1.UnauthorizedException('Account is temporarily locked due to too many failed attempts. Try again later.');
        }
        const passwordValid = await bcrypt.compare(dto.password, user.password);
        if (!passwordValid) {
            const newFailCount = user.failedLoginAttempts + 1;
            if (newFailCount >= MAX_FAILED_ATTEMPTS) {
                // Lock the account
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        failedLoginAttempts: 0,
                        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
                    },
                });
                throw new common_1.UnauthorizedException('Account locked for 15 minutes after too many failed attempts.');
            }
            await this.prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: newFailCount },
            });
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        // Successful login — clear lockout state
        await this.prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
        });
        const payload = {
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
        };
        const token = await this.jwtService.signAsync(payload);
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
            },
        };
    }
    async forgotPassword(dto) {
        // Always return the same message — don't reveal if the email exists
        const SAFE_RESPONSE = {
            message: 'If that email is registered, a reset token has been issued.',
        };
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user)
            return SAFE_RESPONSE;
        // Invalidate any existing unused tokens for this user
        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.id, used: false },
            data: { used: true },
        });
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await this.prisma.passwordResetToken.create({
            data: { token, userId: user.id, expiresAt },
        });
        // In production, email this token to the user.
        // For now, return it in the response so the frontend can handle delivery.
        return {
            ...SAFE_RESPONSE,
            resetToken: token,
            expiresAt,
        };
    }
    async resetPassword(dto) {
        const record = await this.prisma.passwordResetToken.findUnique({
            where: { token: dto.token },
        });
        if (!record || record.used || record.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Reset token is invalid or has expired');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: record.userId },
                data: {
                    password: hashedPassword,
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                },
            }),
            this.prisma.passwordResetToken.update({
                where: { id: record.id },
                data: { used: true },
            }),
        ]);
        return { message: 'Password reset successfully. You can now log in.' };
    }
};
AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
exports.AuthService = AuthService;

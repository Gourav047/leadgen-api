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
exports.TeamService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_log_service_1 = require("../audit-log/audit-log.service");
let TeamService = class TeamService {
    constructor(prisma, auditLog) {
        this.prisma = prisma;
        this.auditLog = auditLog;
    }
    async invite(requestUser, dto) {
        if (requestUser.role === 'MEMBER') {
            throw new common_1.ForbiddenException('Only OWNER or ADMIN can invite members');
        }
        const role = dto.role ?? client_1.UserRole.MEMBER;
        // ADMIN cannot invite other ADMINs or OWNERs
        if (requestUser.role === 'ADMIN' && role !== client_1.UserRole.MEMBER) {
            throw new common_1.ForbiddenException('ADMIN can only invite MEMBERs');
        }
        // Check if the email already belongs to a user in this tenant
        const existingUser = await this.prisma.user.findFirst({
            where: { email: dto.email, tenantId: requestUser.tenantId },
        });
        if (existingUser) {
            throw new common_1.BadRequestException('User with this email is already in your team');
        }
        // Check for an active pending invite for this email in this tenant
        const existingInvite = await this.prisma.invitation.findFirst({
            where: {
                email: dto.email,
                tenantId: requestUser.tenantId,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
        });
        if (existingInvite) {
            throw new common_1.BadRequestException('An active invite already exists for this email');
        }
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
        const invite = await this.prisma.invitation.create({
            data: {
                email: dto.email,
                role,
                token,
                tenantId: requestUser.tenantId,
                invitedBy: requestUser.id,
                expiresAt,
            },
        });
        return {
            message: 'Invite created successfully',
            inviteToken: invite.token,
            expiresAt: invite.expiresAt,
        };
    }
    async acceptInvite(dto) {
        const invite = await this.prisma.invitation.findUnique({
            where: { token: dto.token },
        });
        if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Invite is invalid or has expired');
        }
        // Prevent duplicate account creation via race conditions
        const existingUser = await this.prisma.user.findUnique({
            where: { email: invite.email },
        });
        if (existingUser) {
            throw new common_1.BadRequestException('An account with this email already exists');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const [user] = await this.prisma.$transaction([
            this.prisma.user.create({
                data: {
                    username: dto.username,
                    email: invite.email,
                    password: hashedPassword,
                    role: invite.role,
                    tenantId: invite.tenantId,
                },
            }),
            this.prisma.invitation.update({
                where: { id: invite.id },
                data: { status: 'ACCEPTED' },
            }),
        ]);
        const { password, ...safeUser } = user;
        return safeUser;
    }
    async getMembers(requestUser) {
        const where = { tenantId: requestUser.tenantId };
        if (requestUser.role === 'MEMBER') {
            where.id = requestUser.id;
        }
        const users = await this.prisma.user.findMany({ where });
        return users.map(({ password, ...u }) => u);
    }
    async updateRole(requestUser, targetId, newRole) {
        if (requestUser.role !== 'OWNER') {
            throw new common_1.ForbiddenException('Only OWNER can change roles');
        }
        const target = await this.prisma.user.findFirst({
            where: { id: targetId, tenantId: requestUser.tenantId },
        });
        if (!target)
            throw new common_1.NotFoundException('User not found');
        // Last-owner protection: prevent demoting the only OWNER
        if (target.role === client_1.UserRole.OWNER && newRole !== client_1.UserRole.OWNER) {
            const ownerCount = await this.prisma.user.count({
                where: { tenantId: requestUser.tenantId, role: client_1.UserRole.OWNER },
            });
            if (ownerCount === 1) {
                throw new common_1.ForbiddenException('Cannot demote the last owner. Promote another member first.');
            }
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.user.update({
                where: { id: targetId },
                data: { role: newRole },
            });
            await tx.auditLog.create({
                data: {
                    actorId: requestUser.id,
                    actorRole: requestUser.role,
                    action: client_1.AuditAction.ROLE_CHANGED,
                    entityType: 'User',
                    entityId: targetId,
                    tenantId: requestUser.tenantId,
                    changes: { before: { role: target.role }, after: { role: newRole } },
                },
            });
            return result;
        });
        const { password, ...safeUser } = updated;
        return safeUser;
    }
    async removeMember(requestUser, targetId) {
        if (requestUser.role !== 'OWNER') {
            throw new common_1.ForbiddenException('Only OWNER can remove members');
        }
        const target = await this.prisma.user.findFirst({
            where: { id: targetId, tenantId: requestUser.tenantId },
        });
        if (!target)
            throw new common_1.NotFoundException('User not found');
        // Last-owner protection: prevent removing the only OWNER
        if (target.role === client_1.UserRole.OWNER) {
            const ownerCount = await this.prisma.user.count({
                where: { tenantId: requestUser.tenantId, role: client_1.UserRole.OWNER },
            });
            if (ownerCount === 1) {
                throw new common_1.ForbiddenException('Cannot remove the last owner of the tenant.');
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.auditLog.create({
                data: {
                    actorId: requestUser.id,
                    actorRole: requestUser.role,
                    action: client_1.AuditAction.MEMBER_REMOVED,
                    entityType: 'User',
                    entityId: targetId,
                    tenantId: requestUser.tenantId,
                    changes: { before: { id: target.id, email: target.email, role: target.role }, after: null },
                },
            });
            await tx.user.delete({ where: { id: targetId } });
        });
        return { message: 'Member removed successfully' };
    }
};
TeamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_log_service_1.AuditLogService])
], TeamService);
exports.TeamService = TeamService;

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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_log_service_1 = require("../audit-log/audit-log.service");
let LeadService = class LeadService {
    constructor(prisma, auditLog) {
        this.prisma = prisma;
        this.auditLog = auditLog;
    }
    async create(user, dto) {
        return this.prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
                data: {
                    ...dto,
                    userId: user.id,
                    tenantId: user.tenantId,
                },
            });
            await tx.auditLog.create({
                data: {
                    actorId: user.id,
                    actorRole: user.role,
                    action: client_1.AuditAction.LEAD_CREATED,
                    entityType: 'Lead',
                    entityId: lead.id,
                    tenantId: user.tenantId,
                    changes: { before: null, after: { name: lead.name, email: lead.email, status: lead.status } },
                },
            });
            return lead;
        });
    }
    async findAll(user, page = 1, limit = 10, search) {
        const skip = (page - 1) * limit;
        const where = {
            tenantId: user.tenantId,
            deletedAt: null,
        };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.lead.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.lead.count({ where }),
        ]);
        return {
            data,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
            },
        };
    }
    async findOne(user, id) {
        const lead = await this.prisma.lead.findFirst({
            where: {
                id,
                tenantId: user.tenantId,
                deletedAt: null,
            },
        });
        if (!lead)
            throw new common_1.NotFoundException(`Lead ${id} not found`);
        return lead;
    }
    async update(user, id, dto) {
        const before = await this.findOne(user, id);
        return this.prisma.$transaction(async (tx) => {
            const after = await tx.lead.update({
                where: { id },
                data: dto,
            });
            const changedBefore = {};
            const changedAfter = {};
            for (const key of Object.keys(dto)) {
                if (before[key] !== after[key]) {
                    changedBefore[key] = before[key];
                    changedAfter[key] = after[key];
                }
            }
            await tx.auditLog.create({
                data: {
                    actorId: user.id,
                    actorRole: user.role,
                    action: client_1.AuditAction.LEAD_UPDATED,
                    entityType: 'Lead',
                    entityId: id,
                    tenantId: user.tenantId,
                    changes: { before: changedBefore, after: changedAfter },
                },
            });
            return after;
        });
    }
    async remove(user, id) {
        const existing = await this.findOne(user, id);
        return this.prisma.$transaction(async (tx) => {
            const deletedAt = new Date();
            await tx.lead.update({
                where: { id },
                data: { deletedAt },
            });
            await tx.auditLog.create({
                data: {
                    actorId: user.id,
                    actorRole: user.role,
                    action: client_1.AuditAction.LEAD_DELETED,
                    entityType: 'Lead',
                    entityId: id,
                    tenantId: user.tenantId,
                    changes: { before: { name: existing.name, deletedAt: null }, after: { deletedAt } },
                },
            });
            return { message: 'Lead deleted successfully' };
        });
    }
    async getActivity(user, id, page = 1, limit = 20) {
        await this.findOne(user, id);
        return this.auditLog.getEntityActivity(user.tenantId, id, page, limit);
    }
};
LeadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_log_service_1.AuditLogService])
], LeadService);
exports.LeadService = LeadService;

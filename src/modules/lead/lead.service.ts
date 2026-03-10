import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PLAN_LIMITS } from '../../common/constants/plan-limits';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: any, dto: CreateLeadDto) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where:  { id: user.tenantId },
        select: { plan: true },
      });
      const limit = PLAN_LIMITS[tenant.plan].leads;
      if (limit !== Infinity) {
        const count = await tx.lead.count({ where: { tenantId: user.tenantId, deletedAt: null } });
        if (count >= limit) {
          throw new HttpException(
            `Lead limit reached for ${tenant.plan} plan (${limit}). Upgrade to add more leads.`,
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      const lead = await tx.lead.create({
        data: {
          ...dto,
          userId:   user.id,
          tenantId: user.tenantId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_CREATED,
          entityType: 'Lead',
          entityId:   lead.id,
          tenantId:   user.tenantId,
          changes:    { before: null, after: { name: lead.name, email: lead.email, status: lead.status } },
        },
      });

      return lead;
    });
  }

  async findAll(
    user: any,
    page: number = 1,
    limit: number = 10,
    filters: {
      search?:        string;
      assignedTo?:    string;
      status?:        string;
      tagId?:         string;
      createdAfter?:  string;
      createdBefore?: string;
    } = {},
  ) {
    const { search, assignedTo, status, tagId, createdAfter, createdBefore } = filters;
    const skip = (page - 1) * limit;

    // Each condition goes into AND to avoid clauses overwriting each other
    const and: Prisma.LeadWhereInput[] = [];

    // MEMBER: sees only leads they created OR are assigned to
    if (user.role === 'MEMBER') {
      and.push({ OR: [{ userId: user.id }, { assignedToId: user.id }] });
    } else if (assignedTo) {
      and.push({ assignedToId: assignedTo });
    }

    if (search) {
      and.push({
        OR: [
          { name:    { contains: search, mode: 'insensitive' } },
          { email:   { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (status) {
      and.push({ status: status as any });
    }

    if (tagId) {
      and.push({ tags: { some: { tagId } } });
    }

    if (createdAfter) {
      and.push({ createdAt: { gte: new Date(createdAfter) } });
    }

    if (createdBefore) {
      and.push({ createdAt: { lte: new Date(createdBefore) } });
    }

    const where: Prisma.LeadWhereInput = {
      tenantId:  user.tenantId,
      deletedAt: null,
      ...(and.length ? { AND: and } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: { assignedTo: { select: { id: true, username: true, email: true } } },
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

  async findOne(user: any, id: string) {
    const where: any = { id, tenantId: user.tenantId, deletedAt: null };

    // MEMBER: sees only leads they created OR are assigned to
    if (user.role === 'MEMBER') {
      where.OR = [{ userId: user.id }, { assignedToId: user.id }];
    }

    const lead = await this.prisma.lead.findFirst({
      where,
      include: { assignedTo: { select: { id: true, username: true, email: true } } },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  async update(user: any, id: string, dto: UpdateLeadDto) {
    const before = await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.lead.update({
        where: { id },
        data:  dto,
      });

      const changedBefore: Record<string, unknown> = {};
      const changedAfter:  Record<string, unknown> = {};
      for (const key of Object.keys(dto) as (keyof UpdateLeadDto)[]) {
        if ((before as any)[key] !== (after as any)[key]) {
          changedBefore[key as string] = (before as any)[key];
          changedAfter[key as string]  = (after as any)[key];
        }
      }

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_UPDATED,
          entityType: 'Lead',
          entityId:   id,
          tenantId:   user.tenantId,
          changes:    { before: changedBefore, after: changedAfter } as Prisma.InputJsonValue,
        },
      });

      return after;
    });
  }

  async remove(user: any, id: string) {
    const existing = await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();

      await tx.lead.update({
        where: { id },
        data:  { deletedAt },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_DELETED,
          entityType: 'Lead',
          entityId:   id,
          tenantId:   user.tenantId,
          changes:    { before: { name: existing.name, deletedAt: null }, after: { deletedAt } },
        },
      });

      return { message: 'Lead deleted successfully' };
    });
  }

  async assign(user: any, id: string, dto: AssignLeadDto) {
    // Validate lead exists + caller has access (enforces tenantId + MEMBER ownership)
    const before = await this.findOne(user, id);

    if (dto.assignedToId !== null && dto.assignedToId !== undefined) {
      // MEMBER: can only assign to themselves
      if (user.role === 'MEMBER' && dto.assignedToId !== user.id) {
        throw new ForbiddenException('Members can only assign leads to themselves');
      }
      // Validate assignee belongs to the same tenant
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, tenantId: user.tenantId },
      });
      if (!assignee) throw new NotFoundException('Assignee not found in this tenant');
    }

    return this.prisma.$transaction(async (tx) => {
      const assignedAt = dto.assignedToId ? new Date() : null;

      const after = await tx.lead.update({
        where: { id },
        data:  { assignedToId: dto.assignedToId ?? null, assignedAt },
        include: { assignedTo: { select: { id: true, username: true, email: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_ASSIGNED,
          entityType: 'Lead',
          entityId:   id,
          tenantId:   user.tenantId,
          changes: {
            before: { assignedToId: (before as any).assignedToId ?? null },
            after:  { assignedToId: after.assignedToId, assignedAt: after.assignedAt },
          },
        },
      });

      return after;
    });
  }

  async getActivity(user: any, id: string, page = 1, limit = 20) {
    await this.findOne(user, id);
    return this.auditLog.getEntityActivity(user.tenantId, id, page, limit);
  }
}

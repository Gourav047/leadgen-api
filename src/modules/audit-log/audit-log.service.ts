import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateAuditLogInput {
  actorId?:   string | null;
  actorRole?: string | null;
  action:     AuditAction;
  entityType: string;
  entityId:   string;
  tenantId:   string;
  changes?:   Record<string, unknown> | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId:    input.actorId    ?? null,
        actorRole:  input.actorRole  ?? null,
        action:     input.action,
        entityType: input.entityType,
        entityId:   input.entityId,
        tenantId:   input.tenantId,
        changes:    (input.changes ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async getEntityActivity(
    tenantId: string,
    entityId: string,
    page = 1,
    limit = 20,
  ) {
    const skip  = (page - 1) * limit;
    const where = { tenantId, entityId };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Batch-fetch actors for this page (avoids N+1)
    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter(Boolean)),
    ] as string[];

    const actorMap = new Map<string, { id: string; username: string; email: string }>();
    if (actorIds.length) {
      const users = await this.prisma.user.findMany({
        where:  { id: { in: actorIds } },
        select: { id: true, username: true, email: true },
      });
      for (const u of users) actorMap.set(u.id, u);
    }

    const data = logs.map((log) => ({
      id:          log.id,
      action:      log.action,
      description: this.describeAction(log),
      actor:       log.actorId
        ? (actorMap.get(log.actorId) ?? { id: log.actorId, username: 'Unknown', email: '' })
        : null,
      actorRole:   log.actorRole,
      changes:     log.changes,
      createdAt:   log.createdAt,
    }));

    return {
      data,
      meta: { total, page, lastPage: Math.ceil(total / limit) },
    };
  }

  private describeAction(log: { action: AuditAction; changes: unknown }): string {
    const c = log.changes as Record<string, any> | null;
    switch (log.action) {
      case AuditAction.LEAD_CREATED: return 'Lead created';
      case AuditAction.LEAD_UPDATED: {
        const fields = c?.after ? Object.keys(c.after).join(', ') : '';
        return fields ? `Updated: ${fields}` : 'Lead updated';
      }
      case AuditAction.LEAD_DELETED:      return 'Lead deleted';
      case AuditAction.LEAD_ASSIGNED:     return c?.after?.assignedToId ? 'Lead assigned' : 'Lead unassigned';
      case AuditAction.LEAD_NOTE_CREATED: return 'Note added';
      case AuditAction.LEAD_NOTE_UPDATED: return 'Note edited';
      case AuditAction.LEAD_NOTE_DELETED: return 'Note deleted';
      case AuditAction.TAG_CREATED:       return `Tag created: ${c?.after?.name ?? ''}`;
      case AuditAction.TAG_DELETED:       return `Tag deleted: ${c?.before?.name ?? ''}`;
      case AuditAction.LEAD_TAG_ADDED:    return `Tag added: ${c?.after?.name ?? ''}`;
      case AuditAction.LEAD_TAG_REMOVED:  return `Tag removed: ${c?.before?.name ?? ''}`;
      case AuditAction.ROLE_CHANGED:      return 'Role changed';
      case AuditAction.MEMBER_REMOVED:    return 'Member removed';
      case AuditAction.TENANT_CREATED:    return 'Tenant created';
      case AuditAction.USER_CREATED:      return 'User created';
      default:                            return String(log.action);
    }
  }
}

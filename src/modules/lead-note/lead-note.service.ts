import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { UpdateLeadNoteDto } from './dto/update-lead-note.dto';

const AUTHOR_SELECT = { id: true, username: true, email: true };

@Injectable()
export class LeadNoteService {
  constructor(private readonly prisma: PrismaService) {}

  // Validates the lead exists, belongs to the tenant, and (for MEMBERs) is accessible
  private async assertLeadAccess(user: any, leadId: string) {
    const where: any = { id: leadId, tenantId: user.tenantId, deletedAt: null };
    if (user.role === 'MEMBER') {
      where.OR = [{ userId: user.id }, { assignedToId: user.id }];
    }
    const lead = await this.prisma.lead.findFirst({ where });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return lead;
  }

  async create(user: any, leadId: string, dto: CreateLeadNoteDto) {
    await this.assertLeadAccess(user, leadId);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.leadNote.create({
        data: {
          content:  dto.content,
          leadId,
          userId:   user.id,
          tenantId: user.tenantId,
        },
        include: { user: { select: AUTHOR_SELECT } },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_NOTE_CREATED,
          entityType: 'LeadNote',
          entityId:   note.id,
          tenantId:   user.tenantId,
          changes:    { after: { content: note.content } },
        },
      });

      return note;
    });
  }

  async findAll(user: any, leadId: string, page = 1, limit = 20) {
    await this.assertLeadAccess(user, leadId);

    const skip = (page - 1) * limit;
    const where = { leadId, tenantId: user.tenantId };

    const [data, total] = await Promise.all([
      this.prisma.leadNote.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: AUTHOR_SELECT } },
      }),
      this.prisma.leadNote.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, lastPage: Math.ceil(total / limit) },
    };
  }

  async update(user: any, leadId: string, noteId: string, dto: UpdateLeadNoteDto) {
    await this.assertLeadAccess(user, leadId);

    const note = await this.prisma.leadNote.findFirst({
      where: { id: noteId, leadId, tenantId: user.tenantId },
    });
    if (!note) throw new NotFoundException(`Note ${noteId} not found`);

    if (user.role === 'MEMBER' && note.userId !== user.id) {
      throw new ForbiddenException('You can only edit your own notes');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leadNote.update({
        where:   { id: noteId },
        data:    dto,
        include: { user: { select: AUTHOR_SELECT } },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_NOTE_UPDATED,
          entityType: 'LeadNote',
          entityId:   noteId,
          tenantId:   user.tenantId,
          changes:    { before: { content: note.content }, after: { content: updated.content } },
        },
      });

      return updated;
    });
  }

  async remove(user: any, leadId: string, noteId: string) {
    await this.assertLeadAccess(user, leadId);

    const note = await this.prisma.leadNote.findFirst({
      where: { id: noteId, leadId, tenantId: user.tenantId },
    });
    if (!note) throw new NotFoundException(`Note ${noteId} not found`);

    if (user.role === 'MEMBER' && note.userId !== user.id) {
      throw new ForbiddenException('You can only delete your own notes');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.leadNote.delete({ where: { id: noteId } });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_NOTE_DELETED,
          entityType: 'LeadNote',
          entityId:   noteId,
          tenantId:   user.tenantId,
          changes:    { before: { content: note.content }, after: null },
        },
      });

      return { message: 'Note deleted successfully' };
    });
  }
}

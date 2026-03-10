import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PLAN_LIMITS } from '../../common/constants/plan-limits';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachTagDto } from './dto/attach-tag.dto';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagService {
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

  async createTag(user: any, dto: CreateTagDto) {
    if (user.role === 'MEMBER') {
      throw new ForbiddenException('Only ADMIN or OWNER can create tags');
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where:  { id: user.tenantId },
        select: { plan: true },
      });
      const tagLimit = PLAN_LIMITS[tenant.plan].tags;
      if (tagLimit !== Infinity) {
        const count = await tx.tag.count({ where: { tenantId: user.tenantId } });
        if (count >= tagLimit) {
          throw new HttpException(
            `Tag limit reached for ${tenant.plan} plan (${tagLimit}). Upgrade to create more tags.`,
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      let tag: Awaited<ReturnType<typeof tx.tag.create>>;
      try {
        tag = await tx.tag.create({
          data: { name: dto.name, tenantId: user.tenantId },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(`Tag "${dto.name}" already exists`);
        }
        throw err;
      }

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.TAG_CREATED,
          entityType: 'Tag',
          entityId:   tag.id,
          tenantId:   user.tenantId,
          changes:    { after: { name: tag.name } },
        },
      });

      return tag;
    });
  }

  async findAllTags(user: any) {
    return this.prisma.tag.findMany({
      where:   { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async deleteTag(user: any, tagId: string) {
    if (user.role === 'MEMBER') {
      throw new ForbiddenException('Only ADMIN or OWNER can delete tags');
    }

    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, tenantId: user.tenantId },
    });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);

    return this.prisma.$transaction(async (tx) => {
      // LeadTag rows cascade-delete automatically via DB FK
      await tx.tag.delete({ where: { id: tagId } });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.TAG_DELETED,
          entityType: 'Tag',
          entityId:   tagId,
          tenantId:   user.tenantId,
          changes:    { before: { name: tag.name }, after: null },
        },
      });

      return { message: 'Tag deleted successfully' };
    });
  }

  async attachTag(user: any, leadId: string, dto: AttachTagDto) {
    await this.assertLeadAccess(user, leadId);

    const tag = await this.prisma.tag.findFirst({
      where: { id: dto.tagId, tenantId: user.tenantId },
    });
    if (!tag) throw new NotFoundException('Tag not found');

    return this.prisma.$transaction(async (tx) => {
      const leadTag = await tx.leadTag.upsert({
        where:  { leadId_tagId: { leadId, tagId: dto.tagId } },
        create: { leadId, tagId: dto.tagId },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_TAG_ADDED,
          entityType: 'Lead',
          entityId:   leadId,
          tenantId:   user.tenantId,
          changes:    { after: { tagId: dto.tagId, name: tag.name } },
        },
      });

      return { tagId: dto.tagId, name: tag.name, assignedAt: leadTag.assignedAt };
    });
  }

  async findLeadTags(user: any, leadId: string) {
    await this.assertLeadAccess(user, leadId);

    const rows = await this.prisma.leadTag.findMany({
      where:   { leadId },
      include: { tag: { select: { id: true, name: true } } },
      orderBy: { assignedAt: 'asc' },
    });

    return rows.map((r) => ({ id: r.tag.id, name: r.tag.name, assignedAt: r.assignedAt }));
  }

  async detachTag(user: any, leadId: string, tagId: string) {
    await this.assertLeadAccess(user, leadId);

    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, tenantId: user.tenantId },
    });
    if (!tag) throw new NotFoundException('Tag not found');

    const leadTag = await this.prisma.leadTag.findUnique({
      where: { leadId_tagId: { leadId, tagId } },
    });
    if (!leadTag) throw new NotFoundException('Tag is not attached to this lead');

    return this.prisma.$transaction(async (tx) => {
      await tx.leadTag.delete({ where: { leadId_tagId: { leadId, tagId } } });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.LEAD_TAG_REMOVED,
          entityType: 'Lead',
          entityId:   leadId,
          tenantId:   user.tenantId,
          changes:    { before: { tagId, name: tag.name }, after: null },
        },
      });

      return { message: 'Tag removed from lead' };
    });
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditAction, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: any, dto: CreateApiKeyDto) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only OWNER can create API keys');
    }

    const role = dto.role ?? UserRole.MEMBER;

    // Generate key: lb_ + 32 random bytes as hex (67 chars total)
    const rawKey   = 'lb_' + crypto.randomBytes(32).toString('hex');
    const keyHash  = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 8); // e.g. "lb_a1b2c3"

    return this.prisma.$transaction(async (tx) => {
      const apiKey = await tx.apiKey.create({
        data: {
          name:      dto.name,
          keyHash,
          keyPrefix,
          role,
          tenantId:  user.tenantId,
          createdBy: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.API_KEY_CREATED,
          entityType: 'ApiKey',
          entityId:   apiKey.id,
          tenantId:   user.tenantId,
          changes:    { after: { name: apiKey.name, role: apiKey.role, keyPrefix } },
        },
      });

      // Raw key shown only once — not stored in plaintext
      return {
        id:        apiKey.id,
        name:      apiKey.name,
        role:      apiKey.role,
        keyPrefix: apiKey.keyPrefix,
        key:       rawKey,
        createdAt: apiKey.createdAt,
      };
    });
  }

  async findAll(user: any) {
    if (user.role === UserRole.MEMBER) {
      throw new ForbiddenException('Only OWNER or ADMIN can list API keys');
    }

    const keys = await this.prisma.apiKey.findMany({
      where:   { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        name:      true,
        role:      true,
        keyPrefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return keys;
  }

  async revoke(user: any, id: string) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only OWNER can revoke API keys');
    }

    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!apiKey) throw new NotFoundException(`API key ${id} not found`);

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId:    user.id,
          actorRole:  user.role,
          action:     AuditAction.API_KEY_REVOKED,
          entityType: 'ApiKey',
          entityId:   id,
          tenantId:   user.tenantId,
          changes:    { before: { name: apiKey.name, role: apiKey.role }, after: null },
        },
      });

      await tx.apiKey.delete({ where: { id } });
    });

    return { message: 'API key revoked successfully' };
  }
}

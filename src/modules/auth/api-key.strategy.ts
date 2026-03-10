import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async validate(req: any): Promise<any> {
    const rawKey: string | undefined = req.headers['x-api-key'];
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key header');

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!apiKey) throw new UnauthorizedException('Invalid API key');

    // Fire-and-forget — update lastUsedAt without blocking the request
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return { id: apiKey.createdBy, tenantId: apiKey.tenantId, role: apiKey.role };
  }
}

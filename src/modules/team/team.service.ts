import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuditAction, UserRole } from '@prisma/client';
import { PLAN_LIMITS } from '../../common/constants/plan-limits';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly auditLog:  AuditLogService,
  ) {}

  async invite(requestUser: any, dto: InviteMemberDto) {
    if (requestUser.role === 'MEMBER') {
      throw new ForbiddenException('Only OWNER or ADMIN can invite members');
    }

    const role = dto.role ?? UserRole.MEMBER;

    // ADMIN cannot invite other ADMINs or OWNERs
    if (requestUser.role === 'ADMIN' && role !== UserRole.MEMBER) {
      throw new ForbiddenException('ADMIN can only invite MEMBERs');
    }

    // Plan limit: member count (counts current users, not pending invites)
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where:  { id: requestUser.tenantId },
      select: { plan: true },
    });
    const memberLimit = PLAN_LIMITS[tenant.plan].members;
    if (memberLimit !== Infinity) {
      const count = await this.prisma.user.count({ where: { tenantId: requestUser.tenantId } });
      if (count >= memberLimit) {
        throw new HttpException(
          `Member limit reached for ${tenant.plan} plan (${memberLimit}). Upgrade to invite more members.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    // Check if the email already belongs to a user in this tenant
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: requestUser.tenantId },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email is already in your team');
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
      throw new BadRequestException('An active invite already exists for this email');
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

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
    });

    if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite is invalid or has expired');
    }

    // Prevent duplicate account creation via race conditions
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existingUser) {
      throw new BadRequestException('An account with this email already exists');
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

  async getMembers(requestUser: any) {
    const where: any = { tenantId: requestUser.tenantId };

    if (requestUser.role === 'MEMBER') {
      where.id = requestUser.id;
    }

    const users = await this.prisma.user.findMany({ where });
    return users.map(({ password, ...u }) => u);
  }

  async updateRole(requestUser: any, targetId: string, newRole: UserRole) {
    if (requestUser.role !== 'OWNER') {
      throw new ForbiddenException('Only OWNER can change roles');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetId, tenantId: requestUser.tenantId },
    });
    if (!target) throw new NotFoundException('User not found');

    // Last-owner protection: prevent demoting the only OWNER
    if (target.role === UserRole.OWNER && newRole !== UserRole.OWNER) {
      const ownerCount = await this.prisma.user.count({
        where: { tenantId: requestUser.tenantId, role: UserRole.OWNER },
      });
      if (ownerCount === 1) {
        throw new ForbiddenException(
          'Cannot demote the last owner. Promote another member first.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: targetId },
        data:  { role: newRole },
      });

      await tx.auditLog.create({
        data: {
          actorId:    requestUser.id,
          actorRole:  requestUser.role,
          action:     AuditAction.ROLE_CHANGED,
          entityType: 'User',
          entityId:   targetId,
          tenantId:   requestUser.tenantId,
          changes:    { before: { role: target.role }, after: { role: newRole } },
        },
      });

      return result;
    });

    const { password, ...safeUser } = updated;
    return safeUser;
  }

  async removeMember(requestUser: any, targetId: string) {
    if (requestUser.role !== 'OWNER') {
      throw new ForbiddenException('Only OWNER can remove members');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetId, tenantId: requestUser.tenantId },
    });
    if (!target) throw new NotFoundException('User not found');

    // Last-owner protection: prevent removing the only OWNER
    if (target.role === UserRole.OWNER) {
      const ownerCount = await this.prisma.user.count({
        where: { tenantId: requestUser.tenantId, role: UserRole.OWNER },
      });
      if (ownerCount === 1) {
        throw new ForbiddenException(
          'Cannot remove the last owner of the tenant.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId:    requestUser.id,
          actorRole:  requestUser.role,
          action:     AuditAction.MEMBER_REMOVED,
          entityType: 'User',
          entityId:   targetId,
          tenantId:   requestUser.tenantId,
          changes:    { before: { id: target.id, email: target.email, role: target.role }, after: null },
        },
      });

      await tx.user.delete({ where: { id: targetId } });
    });

    return { message: 'Member removed successfully' };
  }
}

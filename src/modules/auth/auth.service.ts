import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuditAction } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;  // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName },
      });

      const newUser = await tx.user.create({
        data: {
          username: dto.username,
          email:    dto.email,
          password: hashedPassword,
          tenantId: tenant.id,
          role:     'OWNER',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId:    null,
          actorRole:  null,
          action:     AuditAction.TENANT_CREATED,
          entityType: 'Tenant',
          entityId:   tenant.id,
          tenantId:   tenant.id,
          changes:    { before: null, after: { tenantName: dto.companyName, ownerEmail: dto.email } },
        },
      });

      return newUser;
    });

    const { password, ...safeUser } = user;
    return safeUser;
  }

  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always show the same error — don't reveal whether the email exists
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is temporarily locked due to too many failed attempts. Try again later.',
      );
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
        throw new UnauthorizedException(
          'Account locked for 15 minutes after too many failed attempts.',
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newFailCount },
      });

      throw new UnauthorizedException('Invalid email or password');
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

  async forgotPassword(dto: ForgotPasswordDto) {
    // Always return the same message — don't reveal if the email exists
    const SAFE_RESPONSE = {
      message: 'If that email is registered, a reset token has been issued.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) return SAFE_RESPONSE;

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

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
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
}

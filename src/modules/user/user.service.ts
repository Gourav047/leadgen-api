import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, requestUser: any) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const { password, ...safeUser } = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        tenantId: requestUser.tenantId,
      },
    });
    return safeUser;
  }

  async findAll(user: any) {
    const where: any = { tenantId: user.tenantId };

    if (user.role === 'MEMBER') {
      where.id = user.id;
    }

    const users = await this.prisma.user.findMany({ where });
    return users.map(({ password, ...u }) => u);
  }

  async findOne(user: any, id: string) {
    const where: any = { id, tenantId: user.tenantId };

    if (user.role === 'MEMBER') {
      where.id = user.id;
    }

    const found = await this.prisma.user.findFirst({ where });
    if (!found) throw new NotFoundException('User not found');

    const { password, ...safeUser } = found;
    return safeUser;
  }

  async update(user: any, id: string, dto: UpdateUserDto) {
    if (dto.role && user.role !== 'OWNER') {
      throw new ForbiddenException('Only OWNER can change roles');
    }

    const where: any = { id, tenantId: user.tenantId };

    if (user.role === 'MEMBER') {
      where.id = user.id;
    }

    const updateData: any = { ...dto };
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.updateMany({ where, data: updateData });
  }

  async remove(user: any, id: string) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only OWNER can remove users');
    }

    const target = await this.prisma.user.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });
    return { message: 'User removed successfully' };
  }
}

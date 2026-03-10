import { IsOptional, IsString, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @MinLength(6)
  password?: string;

  // ⚠ Role should only be changeable by OWNER (enforced in service)
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
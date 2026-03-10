import { IsString, IsEmail, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { LeadStatus } from '@prisma/client';

export class CreateLeadDto {

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  company?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
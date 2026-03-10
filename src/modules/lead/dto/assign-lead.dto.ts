import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignLeadDto {
  @IsOptional()
  @IsString()
  @IsUUID('4')
  assignedToId!: string | null;
}

import { IsString, IsUUID } from 'class-validator';

export class AttachTagDto {
  @IsString()
  @IsUUID('4')
  tagId!: string;
}

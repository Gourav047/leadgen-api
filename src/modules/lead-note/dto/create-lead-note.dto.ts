import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}

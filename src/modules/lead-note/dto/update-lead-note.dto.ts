import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadNoteDto } from './create-lead-note.dto';

export class UpdateLeadNoteDto extends PartialType(CreateLeadNoteDto) {}

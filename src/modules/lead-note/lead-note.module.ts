import { Module } from '@nestjs/common';
import { LeadNoteController } from './lead-note.controller';
import { LeadNoteService } from './lead-note.service';

@Module({
  controllers: [LeadNoteController],
  providers:   [LeadNoteService],
})
export class LeadNoteModule {}

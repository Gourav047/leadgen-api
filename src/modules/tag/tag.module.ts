import { Module } from '@nestjs/common';
import { TagController } from './tag.controller';
import { LeadTagController } from './lead-tag.controller';
import { TagService } from './tag.service';

@Module({
  controllers: [TagController, LeadTagController],
  providers:   [TagService],
})
export class TagModule {}

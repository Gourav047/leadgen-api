import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { AttachTagDto } from './dto/attach-tag.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('leads/:leadId/tags')
@UseGuards(JwtAuthGuard)
export class LeadTagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  attach(
    @Param('leadId') leadId: string,
    @Req() req: any,
    @Body() dto: AttachTagDto,
  ) {
    return this.tagService.attachTag(req.user, leadId, dto);
  }

  @Get()
  findLeadTags(@Param('leadId') leadId: string, @Req() req: any) {
    return this.tagService.findLeadTags(req.user, leadId);
  }

  @Delete(':tagId')
  detach(
    @Param('leadId') leadId: string,
    @Param('tagId') tagId: string,
    @Req() req: any,
  ) {
    return this.tagService.detachTag(req.user, leadId, tagId);
  }
}

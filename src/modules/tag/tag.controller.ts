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
import { CreateTagDto } from './dto/create-tag.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateTagDto) {
    return this.tagService.createTag(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.tagService.findAllTags(req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tagService.deleteTag(req.user, id);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { LeadNoteService } from './lead-note.service';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { UpdateLeadNoteDto } from './dto/update-lead-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('leads/:leadId/notes')
@UseGuards(JwtAuthGuard)
export class LeadNoteController {
  constructor(private readonly leadNoteService: LeadNoteService) {}

  @Post()
  create(
    @Param('leadId') leadId: string,
    @Req() req: any,
    @Body() dto: CreateLeadNoteDto,
  ) {
    return this.leadNoteService.create(req.user, leadId, dto);
  }

  @Get()
  findAll(
    @Param('leadId') leadId: string,
    @Req() req: any,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.leadNoteService.findAll(req.user, leadId, Number(page), Number(limit));
  }

  @Patch(':noteId')
  update(
    @Param('leadId') leadId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
    @Body() dto: UpdateLeadNoteDto,
  ) {
    return this.leadNoteService.update(req.user, leadId, noteId, dto);
  }

  @Delete(':noteId')
  remove(
    @Param('leadId') leadId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
  ) {
    return this.leadNoteService.remove(req.user, leadId, noteId);
  }
}

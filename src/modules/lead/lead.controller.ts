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
import { LeadService } from './lead.service';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateLeadDto) {
    return this.leadService.create(req.user, dto);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('page')          page          = '1',
    @Query('limit')         limit         = '10',
    @Query('search')        search?:        string,
    @Query('assignedTo')    assignedTo?:    string,
    @Query('status')        status?:        string,
    @Query('tagId')         tagId?:         string,
    @Query('createdAfter')  createdAfter?:  string,
    @Query('createdBefore') createdBefore?: string,
  ) {
    return this.leadService.findAll(
      req.user,
      Number(page),
      Number(limit),
      { search, assignedTo, status, tagId, createdAfter, createdBefore },
    );
  }

  @Get(':id/activity')
  getActivity(
    @Param('id') id: string,
    @Req() req: any,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.leadService.getActivity(req.user, id, Number(page), Number(limit));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.leadService.findOne(req.user, id);
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leadService.assign(req.user, id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.leadService.remove(req.user, id);
  }
}
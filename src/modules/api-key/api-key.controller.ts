import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtOnlyGuard } from '../auth/jwt-only.guard';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /** Create a new API key — OWNER only, JWT-authenticated */
  @UseGuards(JwtOnlyGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.create(req.user, dto);
  }

  /** List all API keys for the tenant — OWNER/ADMIN, JWT-authenticated */
  @UseGuards(JwtOnlyGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.apiKeyService.findAll(req.user);
  }

  /** Revoke an API key — OWNER only, JWT-authenticated */
  @UseGuards(JwtOnlyGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.apiKeyService.revoke(req.user, id);
  }
}

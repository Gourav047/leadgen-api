import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamService } from './team.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

class UpdateRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /** OWNER / ADMIN: send an invite — returns a token the frontend uses */
  @Post('invite')
  @UseGuards(JwtAuthGuard)
  invite(@Body() dto: InviteMemberDto, @Req() req: any) {
    return this.teamService.invite(req.user, dto);
  }

  /** Public: accept an invite and create your account */
  @Post('invite/accept')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.teamService.acceptInvite(dto);
  }

  /** OWNER / ADMIN: list all members; MEMBER: sees self only */
  @Get('members')
  @UseGuards(JwtAuthGuard)
  getMembers(@Req() req: any) {
    return this.teamService.getMembers(req.user);
  }

  /** OWNER only: change a member's role */
  @Patch(':id/role')
  @UseGuards(JwtAuthGuard)
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: any,
  ) {
    return this.teamService.updateRole(req.user, id, dto.role);
  }

  /** OWNER only: remove a member from the tenant */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  removeMember(@Param('id') id: string, @Req() req: any) {
    return this.teamService.removeMember(req.user, id);
  }
}

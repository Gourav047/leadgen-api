"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const team_service_1 = require("./team.service");
const accept_invite_dto_1 = require("./dto/accept-invite.dto");
const invite_member_dto_1 = require("./dto/invite-member.dto");
class UpdateRoleDto {
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.UserRole),
    __metadata("design:type", String)
], UpdateRoleDto.prototype, "role", void 0);
let TeamController = class TeamController {
    constructor(teamService) {
        this.teamService = teamService;
    }
    /** OWNER / ADMIN: send an invite — returns a token the frontend uses */
    invite(dto, req) {
        return this.teamService.invite(req.user, dto);
    }
    /** Public: accept an invite and create your account */
    acceptInvite(dto) {
        return this.teamService.acceptInvite(dto);
    }
    /** OWNER / ADMIN: list all members; MEMBER: sees self only */
    getMembers(req) {
        return this.teamService.getMembers(req.user);
    }
    /** OWNER only: change a member's role */
    updateRole(id, dto, req) {
        return this.teamService.updateRole(req.user, id, dto.role);
    }
    /** OWNER only: remove a member from the tenant */
    removeMember(id, req) {
        return this.teamService.removeMember(req.user, id);
    }
};
__decorate([
    (0, common_1.Post)('invite'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [invite_member_dto_1.InviteMemberDto, Object]),
    __metadata("design:returntype", void 0)
], TeamController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('invite/accept'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accept_invite_dto_1.AcceptInviteDto]),
    __metadata("design:returntype", void 0)
], TeamController.prototype, "acceptInvite", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TeamController.prototype, "getMembers", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateRoleDto, Object]),
    __metadata("design:returntype", void 0)
], TeamController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TeamController.prototype, "removeMember", null);
TeamController = __decorate([
    (0, common_1.Controller)('team'),
    __metadata("design:paramtypes", [team_service_1.TeamService])
], TeamController);
exports.TeamController = TeamController;

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../../prisma/prisma.service");
let UserService = class UserService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, requestUser) {
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const { password, ...safeUser } = await this.prisma.user.create({
            data: {
                username: dto.username,
                email: dto.email,
                password: hashedPassword,
                tenantId: requestUser.tenantId,
            },
        });
        return safeUser;
    }
    async findAll(user) {
        const where = { tenantId: user.tenantId };
        if (user.role === 'MEMBER') {
            where.id = user.id;
        }
        const users = await this.prisma.user.findMany({ where });
        return users.map(({ password, ...u }) => u);
    }
    async findOne(user, id) {
        const where = { id, tenantId: user.tenantId };
        if (user.role === 'MEMBER') {
            where.id = user.id;
        }
        const found = await this.prisma.user.findFirst({ where });
        if (!found)
            throw new common_1.NotFoundException('User not found');
        const { password, ...safeUser } = found;
        return safeUser;
    }
    async update(user, id, dto) {
        if (dto.role && user.role !== 'OWNER') {
            throw new common_1.ForbiddenException('Only OWNER can change roles');
        }
        const where = { id, tenantId: user.tenantId };
        if (user.role === 'MEMBER') {
            where.id = user.id;
        }
        const updateData = { ...dto };
        if (dto.password) {
            updateData.password = await bcrypt.hash(dto.password, 10);
        }
        return this.prisma.user.updateMany({ where, data: updateData });
    }
    async remove(user, id) {
        if (user.role !== 'OWNER') {
            throw new common_1.ForbiddenException('Only OWNER can remove users');
        }
        const target = await this.prisma.user.findFirst({
            where: { id, tenantId: user.tenantId },
        });
        if (!target)
            throw new common_1.NotFoundException('User not found');
        await this.prisma.user.delete({ where: { id } });
        return { message: 'User removed successfully' };
    }
};
UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserService);
exports.UserService = UserService;

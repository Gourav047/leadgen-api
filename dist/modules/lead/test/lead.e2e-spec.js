"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../../../app.module");
const prisma_service_1 = require("../../../prisma/prisma.service");
describe('Lead (e2e)', () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    let app;
    let token;
    beforeAll(async () => {
        const prisma = app.get(prisma_service_1.PrismaService);
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Lead" RESTART IDENTITY CASCADE;`);
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE;`);
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        // login to get token
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/auth/login')
            .send({
            email: process.env.EtE_TEST_USERNAME,
            password: process.env.EtE_TEST_PASSWORD,
        });
        token = res.body.token;
    });
    it('/leads (GET) should require auth', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/leads')
            .expect(401);
    });
    it('/leads (GET) should return data when authorized', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/leads')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
    });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';

describe('Lead (e2e)', () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Lead" RESTART IDENTITY CASCADE;`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE;`);
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // login to get token
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.EtE_TEST_USERNAME,
        password: process.env.EtE_TEST_PASSWORD,
      });

    token = res.body.token;
  });

  it('/leads (GET) should require auth', () => {
    return request(app.getHttpServer())
      .get('/leads')
      .expect(401);
  });

  it('/leads (GET) should return data when authorized', () => {
    return request(app.getHttpServer())
      .get('/leads')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
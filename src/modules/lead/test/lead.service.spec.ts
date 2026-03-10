import { PrismaService } from "../../../prisma/prisma.service";
import { LeadService } from "../lead.service";
import { Test } from '@nestjs/testing';

describe('LeadService', () => {
  let service: LeadService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LeadService,
        {
          provide: PrismaService,
          useValue: {
            lead: {
              findMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(LeadService);
    prisma = module.get(PrismaService);
  });

  it('should return paginated leads', async () => {
    (prisma.lead.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.lead.count as jest.Mock).mockResolvedValue(0);

    const result = await service.findAll(1, 1, 10);

    expect(result.meta.page).toBe(1);
  });
});
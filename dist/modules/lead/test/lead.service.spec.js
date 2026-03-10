"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../prisma/prisma.service");
const lead_service_1 = require("../lead.service");
const testing_1 = require("@nestjs/testing");
describe('LeadService', () => {
    let service;
    let prisma;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                lead_service_1.LeadService,
                {
                    provide: prisma_service_1.PrismaService,
                    useValue: {
                        lead: {
                            findMany: jest.fn(),
                            count: jest.fn(),
                        },
                    },
                },
            ],
        }).compile();
        service = module.get(lead_service_1.LeadService);
        prisma = module.get(prisma_service_1.PrismaService);
    });
    it('should return paginated leads', async () => {
        prisma.lead.findMany.mockResolvedValue([]);
        prisma.lead.count.mockResolvedValue(0);
        const result = await service.findAll(1, 1, 10);
        expect(result.meta.page).toBe(1);
    });
});

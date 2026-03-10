import { PlanType } from '@prisma/client';

export const PLAN_LIMITS: Record<PlanType, { leads: number; members: number; tags: number }> = {
  [PlanType.FREE]:        { leads: 50,       members: 2,        tags: 5        },
  [PlanType.PRO]:         { leads: 500,      members: 10,       tags: Infinity },
  [PlanType.ENTERPRISE]:  { leads: Infinity, members: Infinity, tags: Infinity },
};

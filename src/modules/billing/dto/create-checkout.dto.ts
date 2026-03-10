import { IsEnum } from 'class-validator';
import { PlanType } from '@prisma/client';

export class CreateCheckoutDto {
  @IsEnum(PlanType)
  plan!: PlanType;
}

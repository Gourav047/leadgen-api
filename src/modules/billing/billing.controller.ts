import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getSubscription(@Req() req: any) {
    return this.billingService.getSubscription(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('capabilities')
  getCapabilities(@Req() req: any) {
    return this.billingService.getCapabilities(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckoutSession(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  createPortal(@Req() req: any) {
    return this.billingService.createPortalSession(req.user);
  }

  // No JWT guard — authenticated by Stripe webhook signature in the service
  // req.rawBody (Buffer) is available because rawBody: true is set in main.ts
  @Post('webhook')
  handleWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: any,
  ) {
    return this.billingService.handleWebhook(req.rawBody as Buffer, sig);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanType, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PLAN_LIMITS } from '../../common/constants/plan-limits';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2026-02-25.clover',
    });
  }

  async getSubscription(user: any) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where:  { id: user.tenantId },
      select: { plan: true, subStatus: true, currentPeriodEnd: true, stripeSubId: true },
    });
    return tenant;
  }

  async createCheckoutSession(user: any, dto: CreateCheckoutDto) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant OWNER can manage billing');
    }
    if (dto.plan === PlanType.FREE) {
      throw new BadRequestException('FREE plan requires no checkout. Use the portal to cancel.');
    }

    const priceId = this.priceIdForPlan(dto.plan);
    if (!priceId) {
      throw new BadRequestException(`No Stripe Price ID configured for plan: ${dto.plan}`);
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';

    // Get or create Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email:    user.email,
        metadata: { tenantId: user.tenantId },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data:  { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontendUrl}/billing/cancel`,
      metadata:    { tenantId: user.tenantId },
    });

    return { url: session.url };
  }

  async createPortalSession(user: any) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the tenant OWNER can manage billing');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    if (!tenant.stripeCustomerId) {
      throw new BadRequestException('No active subscription found. Complete checkout first.');
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';

    const session = await this.stripe.billingPortal.sessions.create({
      customer:   tenant.stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        if (!tenantId || !session.subscription) break;

        const sub = await this.stripe.subscriptions.retrieve(session.subscription as string);
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            plan:              this.mapPriceToPlan(sub.items.data[0]?.price.id),
            stripeCustomerId:  session.customer as string,
            stripeSubId:       sub.id,
            subStatus:         this.mapStripeStatus(sub.status),
            currentPeriodEnd:  new Date((sub as any).current_period_end * 1000),
          },
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const tenant = await this.prisma.tenant.findFirst({ where: { stripeSubId: sub.id } });
        if (!tenant) break;

        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            plan:             this.mapPriceToPlan(sub.items.data[0]?.price.id),
            subStatus:        this.mapStripeStatus(sub.status),
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenant = await this.prisma.tenant.findFirst({ where: { stripeSubId: sub.id } });
        if (!tenant) break;

        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            plan:             PlanType.FREE,
            subStatus:        SubscriptionStatus.CANCELED,
            stripeSubId:      null,
            currentPeriodEnd: null,
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenant = await this.prisma.tenant.findFirst({
          where: { stripeCustomerId: invoice.customer as string },
        });
        if (!tenant) break;

        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data:  { subStatus: SubscriptionStatus.PAST_DUE },
        });
        break;
      }
    }

    return { received: true };
  }

  async getCapabilities(user: any) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where:  { id: user.tenantId },
      select: { plan: true, subStatus: true, currentPeriodEnd: true },
    });

    const limits = PLAN_LIMITS[tenant.plan];

    const [leadCount, memberCount, tagCount] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId: user.tenantId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId: user.tenantId } }),
      this.prisma.tag.count({ where: { tenantId: user.tenantId } }),
    ]);

    return {
      plan:            tenant.plan,
      subStatus:       tenant.subStatus,
      currentPeriodEnd: tenant.currentPeriodEnd,
      limits: {
        leads:   { max: limits.leads   === Infinity ? null : limits.leads,   current: leadCount   },
        members: { max: limits.members === Infinity ? null : limits.members, current: memberCount },
        tags:    { max: limits.tags    === Infinity ? null : limits.tags,    current: tagCount    },
      },
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private priceIdForPlan(plan: PlanType): string | undefined {
    const map: Partial<Record<PlanType, string>> = {
      [PlanType.PRO]:        this.config.get<string>('STRIPE_PRO_PRICE_ID'),
      [PlanType.ENTERPRISE]: this.config.get<string>('STRIPE_ENTERPRISE_PRICE_ID'),
    };
    return map[plan];
  }

  private mapPriceToPlan(priceId: string | undefined): PlanType {
    if (priceId === this.config.get<string>('STRIPE_PRO_PRICE_ID'))        return PlanType.PRO;
    if (priceId === this.config.get<string>('STRIPE_ENTERPRISE_PRICE_ID')) return PlanType.ENTERPRISE;
    return PlanType.FREE;
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const map: Partial<Record<Stripe.Subscription.Status, SubscriptionStatus>> = {
      active:   SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
    };
    return map[status] ?? SubscriptionStatus.INCOMPLETE;
  }
}

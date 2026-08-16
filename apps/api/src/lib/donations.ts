import type Stripe from 'stripe';
import type { PrismaClient } from '@entrophy/database';

const DONATION_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
]);

function paymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  if (!session.payment_intent) return undefined;
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
}

/**
 * Handles Stripe checkout events for donations (ARCHITECTURE.md §18). Returns `true` when the event was a
 * donation event this function handled (regardless of whether it changed anything), so `routes/webhooks.ts`
 * knows not to also enqueue it onto `integrations:inbound` — `false` means "not mine, handle it elsewhere".
 *
 * Idempotent: only ever transitions a `Donation` row forward from `PENDING` (`updateMany` with a `status:
 * 'PENDING'` guard is a no-op if the row was already updated by a prior delivery of the same event, which
 * Stripe can send more than once). Stores no personal data — only the Stripe session/payment-intent ids and
 * the amount, never an email or name.
 */
export async function handleStripeDonationEvent(prisma: PrismaClient, event: Stripe.Event): Promise<boolean> {
  if (!DONATION_EVENT_TYPES.has(event.type)) return false;

  const session = event.data?.object as Stripe.Checkout.Session | undefined;
  if (!session || session.metadata?.kind !== 'donation') return false;

  switch (event.type) {
    case 'checkout.session.completed': {
      await prisma.donation.updateMany({
        where: { stripeSessionId: session.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          amountCents: session.amount_total ?? undefined,
          stripePaymentIntentId: paymentIntentId(session),
          paidAt: new Date(),
        },
      });
      return true;
    }
    case 'checkout.session.expired': {
      await prisma.donation.updateMany({
        where: { stripeSessionId: session.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      return true;
    }
    case 'checkout.session.async_payment_failed': {
      await prisma.donation.updateMany({
        where: { stripeSessionId: session.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return true;
    }
    default:
      return false;
  }
}

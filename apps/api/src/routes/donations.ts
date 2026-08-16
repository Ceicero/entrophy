// `/donations/*` (NOT under `/guilds`, not session-authenticated) — see ARCHITECTURE.md §18. Public, rate-limited
// (10/min/IP per route), stores no personal data (no email/name — see `lib/donations.ts`). The Stripe SDK is
// imported lazily so the API boots fine without `STRIPE_SECRET_KEY` set; both routes degrade to an "unavailable"
// response in that case instead of throwing at boot.
import type Stripe from 'stripe';
import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AppError, ExternalServiceError, ValidationError, env, listFromCsv, newId } from '@entrophy/core';
import type { DonationCheckoutRequest, DonationCheckoutResponse, DonationPresetsDto } from '@entrophy/types';

const DEFAULT_PRESETS_CENTS = [300, 500, 1000, 2500, 5000];
const DONATIONS_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

function presetsCents(): number[] {
  const raw = listFromCsv(env.DONATION_PRESETS_CENTS)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0);
  return raw.length > 0 ? raw : DEFAULT_PRESETS_CENTS;
}

function donationsUnavailable(): AppError {
  return new AppError('donations_unavailable', 'Donations are not configured on this server right now.', { status: 503, expose: true });
}

let stripeClientPromise: Promise<Stripe> | null = null;

/** Lazily constructs (and caches) the Stripe client. Resolves `null` when `STRIPE_SECRET_KEY` is unset — the
 * caller treats that as "donations unavailable" rather than an error. */
async function getStripeClient(): Promise<Stripe | null> {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClientPromise) {
    stripeClientPromise = import('stripe').then(({ default: StripeSdk }) => new StripeSdk(secretKey));
  }
  return stripeClientPromise;
}

const checkoutBodySchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.literal('usd'),
}) satisfies z.ZodType<DonationCheckoutRequest>;

/** `/donations/*` — public one-time Stripe donation checkout (ARCHITECTURE.md §18). */
export default async function donationsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/presets', DONATIONS_RATE_LIMIT, async (): Promise<DonationPresetsDto> => {
    return {
      enabled: Boolean(env.STRIPE_SECRET_KEY),
      currency: 'usd',
      presetsCents: presetsCents(),
      minCents: env.DONATION_MIN_CENTS,
      maxCents: env.DONATION_MAX_CENTS,
    };
  });

  app.post(
    '/checkout',
    { ...DONATIONS_RATE_LIMIT, schema: { body: checkoutBodySchema } },
    async (request): Promise<DonationCheckoutResponse> => {
      const { amountCents, currency } = request.body;

      const min = env.DONATION_MIN_CENTS;
      const max = env.DONATION_MAX_CENTS;
      if (amountCents < min || amountCents > max) {
        throw new ValidationError(`Donation amount must be between ${min} and ${max} cents.`);
      }

      const stripe = await getStripeClient();
      if (!stripe || !env.WEB_URL) {
        throw donationsUnavailable();
      }

      // Created before the Stripe call so a PENDING row exists even if the process crashes mid-request; the
      // real Stripe session id (globally unique) replaces this placeholder once the session is created. The
      // placeholder is still unique (random id) so it never collides with a real `cs_...` session id or another
      // pending row.
      const donation = await app.prisma.donation.create({
        data: { stripeSessionId: `pending_${newId()}`, amountCents, currency, status: 'PENDING' },
      });

      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          submit_type: 'donate',
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: amountCents,
                product_data: { name: 'Entrophy donation' },
              },
              quantity: 1,
            },
          ],
          success_url: `${env.WEB_URL}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.WEB_URL}/donate/cancelled`,
          metadata: { kind: 'donation', donationId: donation.id },
        });
      } catch (err) {
        app.log.error({ err, donationId: donation.id }, 'Stripe checkout session creation failed');
        throw new ExternalServiceError('Could not start the donation checkout. Please try again shortly.');
      }

      if (!session.url) {
        app.log.error({ donationId: donation.id, sessionId: session.id }, 'Stripe checkout session has no url');
        throw new ExternalServiceError('Could not start the donation checkout. Please try again shortly.');
      }

      await app.prisma.donation.update({ where: { id: donation.id }, data: { stripeSessionId: session.id } });

      return { url: session.url };
    },
  );
}

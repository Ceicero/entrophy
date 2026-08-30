// `/donations/*` (NOT under `/guilds`, not session-authenticated) — see ARCHITECTURE.md §18. Public,
// rate-limited (10/min/IP per route, plus a global hourly ceiling across all callers enforced in `app.ts`),
// stores no personal data (no email/name — see `lib/donations.ts`). The Stripe SDK is imported lazily so the
// API boots fine without `STRIPE_SECRET_KEY` set; both routes degrade to an "unavailable" response in that
// case instead of throwing at boot.
//
// SECURITY: this endpoint was abused for card testing on 2026-08-26 — an attacker made ~125 unauthenticated
// `POST /checkout` calls at exactly $1.00 (the old `DONATION_MIN_CENTS` default), got the owner's Stripe account
// banned, and never even needed the checkout session to complete since Stripe attempts the card charge at
// session-creation time. The controls below exist specifically to stop that pattern from working again — do not
// weaken any of them without understanding why they're here:
//   - `POST /checkout` is unavailable (503) unless a CAPTCHA provider is configured, in addition to Stripe.
//   - The CAPTCHA response is verified server-side with the provider BEFORE any side effect — no Donation row is
//     created and Stripe is never called until a human is confirmed.
//   - `amountCents` must be exactly one of the configured presets, not an arbitrary caller-chosen number, so a
//     script can no longer probe a specific "test" amount like $1.00. The min/max range check is kept as a
//     secondary defense-in-depth measure only.
//   - `DONATION_MIN_CENTS` defaults to $5.00 instead of $1.00 (see `packages/core/src/env.ts`).
//   - `DONATION_MAX_PER_HOUR` (see `packages/core/src/env.ts`, enforced in `app.ts`) caps total checkouts/hour
//     across all callers as a last line of defense.
import type Stripe from 'stripe';
import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { AppError, ExternalServiceError, ValidationError, env, listFromCsv, newId } from '@entrophy/core';
import type { DonationCheckoutRequest, DonationCheckoutResponse, DonationPresetsDto } from '@entrophy/types';
import { resolveProvider, siteverify } from '../lib/captcha';

const DEFAULT_PRESETS_CENTS = [500, 1000, 2500, 5000];
const DONATIONS_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

function presetsCents(): number[] {
  const raw = listFromCsv(env.DONATION_PRESETS_CENTS)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0);
  return raw.length > 0 ? raw : DEFAULT_PRESETS_CENTS;
}

function donationsUnavailable(): AppError {
  return new AppError('donations_unavailable', 'Donations are not configured on this server right now.', {
    status: 503,
    expose: true,
  });
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
  captchaToken: z.string().min(1),
}) satisfies z.ZodType<DonationCheckoutRequest>;

/** `/donations/*` — public one-time Stripe donation checkout (ARCHITECTURE.md §18). */
export default async function donationsRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/presets', DONATIONS_RATE_LIMIT, async (): Promise<DonationPresetsDto> => {
    const provider = resolveProvider();
    return {
      // Available only when BOTH Stripe and a CAPTCHA provider are configured — see the file header.
      enabled: Boolean(env.STRIPE_SECRET_KEY) && provider !== null,
      currency: 'usd',
      presetsCents: presetsCents(),
      minCents: env.DONATION_MIN_CENTS,
      maxCents: env.DONATION_MAX_CENTS,
      captchaProvider: provider?.id ?? null,
      captchaSiteKey: provider?.siteKey ?? null, // public key only — the secret never leaves the server
    };
  });

  app.post(
    '/checkout',
    { ...DONATIONS_RATE_LIMIT, schema: { body: checkoutBodySchema } },
    async (request): Promise<DonationCheckoutResponse> => {
      const { amountCents, currency, captchaToken } = request.body;

      // A configured CAPTCHA provider is required before anything else, even if Stripe itself is fully
      // configured — see the file header for why.
      const provider = resolveProvider();
      if (!provider) {
        throw donationsUnavailable();
      }

      // The amount must be exactly one of the configured presets, not an arbitrary caller-chosen number. The
      // min/max range check is kept as secondary defense-in-depth in case presets are ever misconfigured
      // outside that range.
      const presets = presetsCents();
      const min = env.DONATION_MIN_CENTS;
      const max = env.DONATION_MAX_CENTS;
      if (!presets.includes(amountCents) || amountCents < min || amountCents > max) {
        throw new ValidationError(
          `Donation amount must be one of the preset amounts (in cents): ${presets.join(', ')}.`,
        );
      }

      // Verify the CAPTCHA response server-side with the provider before any side effect below — no Donation
      // row is created and Stripe is never called until a human is confirmed. Never trust the client's own
      // claim of success.
      const captchaOk = await siteverify(provider, captchaToken, request.ip);
      if (!captchaOk) {
        throw new ValidationError('Could not verify you are human. Please try again.');
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
          // Donations aren't a merchant-of-record digital product sale, so opt out of Stripe's Managed Payments
          // (default-on for new accounts) — otherwise Checkout Session creation fails requiring a product tax
          // code, and leaving it on would add Stripe's 3.5% Managed Payments fee on top of processing fees.
          managed_payments: { enabled: false },
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
        app.log.error(
          { donationId: donation.id, sessionId: session.id },
          'Stripe checkout session has no url',
        );
        throw new ExternalServiceError('Could not start the donation checkout. Please try again shortly.');
      }

      await app.prisma.donation.update({ where: { id: donation.id }, data: { stripeSessionId: session.id } });

      return { url: session.url };
    },
  );
}

import type { DonationCheckoutRequest, DonationCheckoutResponse, DonationPresetsDto } from '@entrophy/types';
import { apiUrl } from './site';

export class DonationsApiError extends Error {}

/** Server-side fetch of `GET /donations/presets` (ARCHITECTURE.md §18). Never cached — donations availability
 * (whether Stripe is configured) can change without a rebuild, and this call happens at request time so the
 * production build never needs the API reachable at build time. Never throws for an ordinary "unavailable"
 * response — that's a valid, renderable state the page handles explicitly. */
export async function fetchDonationPresets(): Promise<DonationPresetsDto> {
  try {
    const res = await fetch(`${apiUrl()}/donations/presets`, { cache: 'no-store' });
    if (!res.ok) throw new DonationsApiError(`Unexpected status ${res.status}`);
    return (await res.json()) as DonationPresetsDto;
  } catch {
    // API unreachable (down, misconfigured URL, offline build preview, etc.) degrades to the same
    // "unavailable" shape the API itself returns when Stripe isn't configured.
    return {
      enabled: false,
      currency: 'usd',
      presetsCents: [300, 500, 1000, 2500, 5000],
      minCents: 100,
      maxCents: 50000,
    };
  }
}

/** Client-side call of `POST /donations/checkout`. Throws `DonationsApiError` with a user-facing message on
 * failure — the caller shows it inline instead of navigating anywhere. */
export async function startDonationCheckout(
  body: DonationCheckoutRequest,
): Promise<DonationCheckoutResponse> {
  const res = await fetch(`${apiUrl()}/donations/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new DonationsApiError(
      payload?.error?.message ?? 'Could not start checkout. Please try again shortly.',
    );
  }

  return (await res.json()) as DonationCheckoutResponse;
}

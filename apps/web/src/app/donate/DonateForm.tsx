'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DonationPresetsDto } from '@entrophy/types';
import { Button } from '../../components/Button';
import { Glass } from '../../components/Glass';
import { startDonationCheckout, DonationsApiError } from '../../lib/donations';

interface DonateFormProps {
  presets: DonationPresetsDto;
}

function centsToDollarLabel(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// Minimal shape of the bits of the Turnstile/hCaptcha widget APIs this form actually calls. Both providers
// expose the same explicit-render surface: `render(container, params)` returns a widget id, `reset(widgetId)`
// clears a used/expired widget so a fresh token can be obtained, and `remove(widgetId)` tears it down. Declared
// here (not `any`) per project TypeScript-strict rules; only the fields we use are typed.
interface CaptchaWidgetParams {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface CaptchaWidgetApi {
  render: (container: HTMLElement, params: CaptchaWidgetParams) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: CaptchaWidgetApi;
    hcaptcha?: CaptchaWidgetApi;
    __entrophyCaptchaOnload?: () => void;
  }
}

const CAPTCHA_SCRIPT_SRC: Record<'turnstile' | 'hcaptcha', string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  hcaptcha: 'https://hcaptcha.com/1/api.js',
};

const CAPTCHA_GLOBAL_ONLOAD = '__entrophyCaptchaOnload';

/** Loads a CAPTCHA provider's script at most once (by `src`), then resolves. Uses a global `onload` callback
 * name (rather than the script element's own `onload`) because that's what the explicit-render query param
 * (`?render=explicit&onload=...`) requires — both providers call the *named global function*, not the script
 * tag's load event, once their SDK has finished initializing. */
function loadCaptchaScript(provider: 'turnstile' | 'hcaptcha'): Promise<void> {
  const src = CAPTCHA_SCRIPT_SRC[provider];
  const existing = document.querySelector<HTMLScriptElement>(`script[data-entrophy-captcha="${provider}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
    });
  }

  return new Promise((resolve) => {
    window[CAPTCHA_GLOBAL_ONLOAD] = () => {
      resolve();
    };
    const script = document.createElement('script');
    script.src = `${src}?render=explicit&onload=${CAPTCHA_GLOBAL_ONLOAD}`;
    script.async = true;
    script.defer = true;
    script.dataset.entrophyCaptcha = provider;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
    });
    document.head.appendChild(script);
  });
}

export function DonateForm({ presets }: DonateFormProps) {
  const [selected, setSelected] = useState<number | null>(presets.presetsCents[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const amountValid = selected !== null && presets.presetsCents.includes(selected);

  // Mount the CAPTCHA widget once, explicit-rendered into `captchaContainerRef`. Nothing to do if no provider
  // is configured — the parent page shows the "not configured" state in that case, but this form is defensive
  // about it too so it never renders a submit path it knows will 503.
  useEffect(() => {
    const provider = presets.captchaProvider;
    const siteKey = presets.captchaSiteKey;
    if (!provider || !siteKey) return;

    let cancelled = false;

    loadCaptchaScript(provider).then(() => {
      if (cancelled) return;
      const api = window[provider];
      const container = captchaContainerRef.current;
      if (!api || !container) return;

      widgetIdRef.current = api.render(container, {
        sitekey: siteKey,
        callback: (token) => {
          if (!cancelled) setCaptchaToken(token);
        },
        'expired-callback': () => {
          if (!cancelled) setCaptchaToken(null);
        },
        'error-callback': () => {
          if (!cancelled) setCaptchaToken(null);
        },
      });
    });

    return () => {
      cancelled = true;
      const provider2 = presets.captchaProvider;
      const api = provider2 ? window[provider2] : undefined;
      if (api && widgetIdRef.current) {
        api.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Intentionally scoped to the provider/site key — this form's `presets` prop is fixed for the lifetime of
    // the page (server-fetched once), so this effect is expected to run exactly once per mount.
  }, [presets.captchaProvider, presets.captchaSiteKey]);

  const resetCaptcha = useCallback(() => {
    const provider = presets.captchaProvider;
    const api = provider ? window[provider] : undefined;
    if (api && widgetIdRef.current) {
      api.reset(widgetIdRef.current);
    }
    setCaptchaToken(null);
  }, [presets.captchaProvider]);

  async function handleDonate() {
    if (!amountValid || selected === null || !captchaToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const { url } = await startDonationCheckout({
        amountCents: selected,
        currency: 'usd',
        captchaToken,
      });
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof DonationsApiError ? err.message : 'Something went wrong. Please try again shortly.',
      );
      setSubmitting(false);
      // The CAPTCHA token is single-use — the server already consumed (or rejected) it, so a retry with the
      // same token would also fail. Reset the widget and clear it so the user gets a fresh one before retrying.
      resetCaptcha();
    }
  }

  const canSubmit = amountValid && Boolean(captchaToken) && Boolean(presets.captchaProvider) && !submitting;

  return (
    <Glass className="p-6 sm:p-8">
      <fieldset>
        <legend className="text-sm font-semibold uppercase tracking-wider text-grey-2">
          Choose an amount
        </legend>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {presets.presetsCents.map((cents) => {
            const active = selected === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => setSelected(cents)}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grey-5 ${
                  active
                    ? 'border-transparent bg-paper text-ink-0'
                    : 'border-white/15 text-grey-4 hover:border-white/30 hover:text-grey-7'
                }`}
              >
                {centsToDollarLabel(cents)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {presets.captchaProvider ? (
        <div className="mt-6 flex justify-center" ref={captchaContainerRef} />
      ) : (
        <p className="mt-6 text-xs text-grey-2">
          Human verification isn&apos;t configured on this deployment, so donations are temporarily
          unavailable.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-grey-6">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        disabled={!canSubmit}
        onClick={handleDonate}
      >
        {submitting
          ? 'Redirecting to Stripe…'
          : selected
            ? `Donate ${centsToDollarLabel(selected)}`
            : 'Donate'}
      </Button>

      <p className="mt-4 text-xs leading-relaxed text-grey-2">
        Donations are processed by Stripe Checkout — your card details never touch Entrophy's servers.
        Donations are one-time, non-refundable, grant no perks or in-game advantages, and are not
        tax-deductible unless stated otherwise.
      </p>
    </Glass>
  );
}

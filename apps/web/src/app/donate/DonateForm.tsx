'use client';

import { useMemo, useState } from 'react';
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

export function DonateForm({ presets }: DonateFormProps) {
  const [selected, setSelected] = useState<number | null>(presets.presetsCents[0] ?? null);
  const [customValue, setCustomValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customCents = useMemo(() => {
    const trimmed = customValue.trim();
    if (trimmed === '') return null;
    const dollars = Number.parseFloat(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0) return null;
    return Math.round(dollars * 100);
  }, [customValue]);

  const amountCents = customValue.trim() !== '' ? customCents : selected;
  const amountValid = amountCents !== null && amountCents >= presets.minCents && amountCents <= presets.maxCents;

  async function handleDonate() {
    if (!amountValid || amountCents === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const { url } = await startDonationCheckout({ amountCents, currency: 'usd' });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof DonationsApiError ? err.message : 'Something went wrong. Please try again shortly.');
      setSubmitting(false);
    }
  }

  return (
    <Glass className="p-6 sm:p-8">
      <fieldset>
        <legend className="text-sm font-semibold uppercase tracking-wider text-grey-2">Choose an amount</legend>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {presets.presetsCents.map((cents) => {
            const active = customValue.trim() === '' && selected === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => {
                  setSelected(cents);
                  setCustomValue('');
                }}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grey-5 ${
                  active ? 'border-transparent bg-paper text-ink-0' : 'border-white/15 text-grey-4 hover:border-white/30 hover:text-grey-7'
                }`}
              >
                {centsToDollarLabel(cents)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="custom-amount" className="text-sm font-semibold uppercase tracking-wider text-grey-2">
          Or enter a custom amount (USD)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-grey-4">$</span>
          <input
            id="custom-amount"
            type="number"
            inputMode="decimal"
            min={presets.minCents / 100}
            max={presets.maxCents / 100}
            step="0.01"
            placeholder={`${presets.minCents / 100}–${presets.maxCents / 100}`}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-grey-7 placeholder:text-grey-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grey-5"
          />
        </div>
        <p className="mt-2 text-xs text-grey-2">
          Min {centsToDollarLabel(presets.minCents)}, max {centsToDollarLabel(presets.maxCents)}.
        </p>
      </div>

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
        disabled={!amountValid || submitting}
        onClick={handleDonate}
      >
        {submitting ? 'Redirecting to Stripe…' : amountCents ? `Donate ${centsToDollarLabel(amountCents)}` : 'Donate'}
      </Button>

      <p className="mt-4 text-xs leading-relaxed text-grey-2">
        Donations are processed by Stripe Checkout — your card details never touch Entrophy's servers. Donations are one-time,
        non-refundable, grant no perks or in-game advantages, and are not tax-deductible unless stated otherwise.
      </p>
    </Glass>
  );
}

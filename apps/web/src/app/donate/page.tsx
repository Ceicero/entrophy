import type { Metadata } from 'next';
import { Section } from '../../components/Section';
import { Glass } from '../../components/Glass';
import { DonateForm } from './DonateForm';
import { fetchDonationPresets } from '../../lib/donations';

export const metadata: Metadata = {
  title: 'Donate',
  description: 'Support Entrophy\'s hosting and development with a one-time donation via Stripe Checkout.',
};

// Fetched at request time (never at build time) — donations availability depends on whether the API has
// STRIPE_SECRET_KEY configured, which can change without a rebuild of this site.
export const dynamic = 'force-dynamic';

export default async function DonatePage() {
  const presets = await fetchDonationPresets();

  return (
    <Section
      eyebrow="Donate"
      title="Help keep Entrophy running"
      subtitle="Entrophy is community-run. Donations fund hosting and development — one-time, non-refundable, and they grant no perks or in-game advantages."
    >
      <div className="mx-auto max-w-lg">
        {presets.enabled ? (
          <DonateForm presets={presets} />
        ) : (
          <Glass className="p-8 text-center">
            <h2 className="text-lg font-semibold text-grey-7">Donations aren&apos;t set up yet</h2>
            <p className="mt-3 text-sm leading-relaxed text-grey-3">
              This deployment of Entrophy hasn&apos;t configured Stripe yet, so donations aren&apos;t available right now. Check back later,
              or reach out through the support server if you&apos;d like to help another way.
            </p>
          </Glass>
        )}
      </div>
    </Section>
  );
}

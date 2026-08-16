import type { Metadata } from 'next';
import { Section } from '../../../components/Section';
import { Glass } from '../../../components/Glass';
import { ButtonLink } from '../../../components/Button';

export const metadata: Metadata = {
  title: 'Thank you',
  description: 'Thank you for supporting Entrophy.',
  robots: { index: false },
};

// Note: this page intentionally never calls Stripe (client or server) to look up the session behind
// `session_id` — it exists in the URL only because Stripe's success_url template requires a placeholder, not
// because this page needs to read it. The confirmation is generic and identical for everyone; the definitive
// payment status is recorded server-side by the `/webhooks/stripe` handler (ARCHITECTURE.md §18).
export default function DonateThanksPage() {
  return (
    <Section as="div" className="pb-32 pt-24">
      <Glass className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-grey-7">Thank you</h1>
        <p className="mt-4 text-sm leading-relaxed text-grey-3">
          Your donation helps keep Entrophy&apos;s hosting and development running. If your card was charged,
          you&apos;ll see a receipt from Stripe in your inbox.
        </p>
        <div className="mt-8">
          <ButtonLink href="/" variant="outline">
            Back to home
          </ButtonLink>
        </div>
      </Glass>
    </Section>
  );
}

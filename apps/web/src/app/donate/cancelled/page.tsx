import type { Metadata } from 'next';
import { Section } from '../../../components/Section';
import { Glass } from '../../../components/Glass';
import { ButtonLink } from '../../../components/Button';

export const metadata: Metadata = {
  title: 'Donation cancelled',
  description: 'Your donation checkout was cancelled.',
  robots: { index: false },
};

export default function DonateCancelledPage() {
  return (
    <Section as="div" className="pb-32 pt-24">
      <Glass className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-grey-7">Checkout cancelled</h1>
        <p className="mt-4 text-sm leading-relaxed text-grey-3">
          No charge was made. You can try again anytime — every bit helps keep Entrophy running.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/donate" variant="primary">
            Try again
          </ButtonLink>
          <ButtonLink href="/" variant="ghost">
            Back to home
          </ButtonLink>
        </div>
      </Glass>
    </Section>
  );
}

import { Section } from '../components/Section';
import { Glass } from '../components/Glass';
import { ButtonLink } from '../components/Button';

export default function NotFound() {
  return (
    <Section as="div" className="pb-32 pt-24">
      <Glass className="mx-auto max-w-lg p-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-grey-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-grey-7">Page not found</h1>
        <p className="mt-4 text-sm leading-relaxed text-grey-3">
          The page you&apos;re looking for doesn&apos;t exist, or has moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" variant="primary">
            Back to home
          </ButtonLink>
          <ButtonLink href="/features" variant="ghost">
            Browse features
          </ButtonLink>
        </div>
      </Glass>
    </Section>
  );
}

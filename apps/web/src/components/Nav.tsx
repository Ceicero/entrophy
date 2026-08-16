import { Logo } from './Logo';
import { ButtonLink } from './Button';
import { dashboardUrl, inviteUrl } from '../lib/site';

const LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/enforcer', label: 'Enforcer' },
  { href: '/donate', label: 'Donate' },
];

export function Nav() {
  const invite = inviteUrl();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-0/70 backdrop-blur-xl">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"
      >
        <Logo />
        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-grey-3 transition-colors hover:text-grey-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grey-5 rounded"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <ButtonLink
            href={dashboardUrl()}
            external
            variant="ghost"
            size="md"
            className="hidden sm:inline-flex"
          >
            Open dashboard
          </ButtonLink>
          {invite ? (
            <ButtonLink href={invite} external variant="primary" size="md">
              Add to Discord
            </ButtonLink>
          ) : (
            <ButtonLink href="/features" variant="primary" size="md">
              Explore features
            </ButtonLink>
          )}
        </div>
      </nav>
    </header>
  );
}

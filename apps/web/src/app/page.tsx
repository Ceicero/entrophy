import { ShieldCheck, ScrollText, EyeOff, Gauge } from 'lucide-react';
import { Section } from '../components/Section';
import { Glass } from '../components/Glass';
import { Badge } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { PluginCard } from '../components/PluginCard';
import { Logo } from '../components/Logo';
import { siteCopy } from '../content/site';
import { pluginCopy } from '../content/plugins';
import { allPluginExports, totalCommandCount } from '../lib/commands';
import { dashboardUrl, inviteUrl } from '../lib/site';

const TRUST_ICONS = [ShieldCheck, EyeOff, ScrollText, Gauge];

export default function HomePage() {
  const plugins = allPluginExports();
  const invite = inviteUrl();
  const commandCount = totalCommandCount();

  return (
    <>
      {/* Hero */}
      <Section className="pb-12 pt-20 sm:pt-28" as="div">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8 flex justify-center">
            <Logo imageSize={64} withWordmark={false} />
          </div>
          <Badge tone="outline" className="mb-6">
            {plugins.length} modular plugins · {commandCount}+ commands · never Administrator
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-grey-7 sm:text-6xl">
            {siteCopy.heroTitle}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-grey-3">{siteCopy.heroSubtitle}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {invite ? (
              <ButtonLink href={invite} external variant="primary" size="lg">
                Add to Discord
              </ButtonLink>
            ) : (
              <ButtonLink href="/features" variant="primary" size="lg">
                Explore features
              </ButtonLink>
            )}
            <ButtonLink href={dashboardUrl()} external variant="outline" size="lg">
              Open dashboard
            </ButtonLink>
          </div>
        </div>
      </Section>

      {/* Feature overview grid */}
      <Section
        id="features"
        eyebrow="Everything, opt-in"
        title="One bot, every module you actually need"
        subtitle="Every plugin can be enabled or disabled per server. Nothing here is forced on you, and nothing here asks for the Administrator permission."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} copy={pluginCopy[plugin.id]} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <ButtonLink href="/features" variant="ghost">
            See the full command reference →
          </ButtonLink>
        </div>
      </Section>

      {/* Why gaming communities */}
      <Section
        eyebrow="Made for game servers"
        title={siteCopy.whyGaming.title}
        subtitle={siteCopy.whyGaming.intro}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteCopy.whyGaming.points.map((point) => (
            <Glass key={point.title} className="p-6">
              <h3 className="text-base font-semibold text-grey-7">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-grey-3">{point.body}</p>
            </Glass>
          ))}
        </div>
      </Section>

      {/* Enforcer teaser */}
      <Section
        eyebrow="Admin Enforcer"
        title="Flag it. Review it. Decide. It's all bookkept."
        subtitle="Enforcer flags possible policy violations, shows a moderator the exact chat context, and executes their decision — so staff never have to confront a player directly. Every flag and every decision lands in a read-only ledger."
      >
        <Glass className="flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-grey-3">
              Policy-driven, hands-off moderation with a full appeal trail — built for communities that need
              to show their moderation is fair.
            </p>
          </div>
          <ButtonLink href="/enforcer" variant="outline" className="shrink-0">
            See how it works →
          </ButtonLink>
        </Glass>
      </Section>

      {/* Trust & compliance */}
      <Section eyebrow="The moat" title={siteCopy.trust.title} subtitle={siteCopy.trust.intro}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {siteCopy.trust.points.map((point, i) => {
            const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
            return (
              <Glass key={point.title} className="flex gap-4 p-6">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-grey-4" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-grey-7">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-grey-3">{point.body}</p>
                </div>
              </Glass>
            );
          })}
        </div>
      </Section>

      {/* Donate CTA */}
      <Section as="div">
        <Glass className="flex flex-col items-center gap-6 p-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-grey-7">{siteCopy.donateCta.title}</h2>
          <p className="max-w-xl text-sm leading-relaxed text-grey-3">{siteCopy.donateCta.body}</p>
          <ButtonLink href="/donate" variant="primary" size="lg">
            Donate
          </ButtonLink>
        </Glass>
      </Section>
    </>
  );
}

import type { FaqEntry } from '../content/enforcer';

interface FaqProps {
  items: FaqEntry[];
}

export function Faq({ items }: FaqProps) {
  return (
    <dl className="divide-y divide-white/10 rounded-2xl border border-white/10">
      {items.map((item) => (
        <div key={item.question} className="p-6">
          <dt className="text-base font-medium text-grey-7">{item.question}</dt>
          <dd className="mt-2 text-sm leading-relaxed text-grey-3">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}

import { describe, expect, it } from 'vitest';
import {
  CHANNEL_KIND_TYPES,
  filterChannelOptions,
  type ChannelPickerOption,
} from '../components/channel-picker';

const options: ChannelPickerOption[] = [
  { id: 't', name: 'general', type: 0 },
  { id: 'v', name: 'lounge', type: 2 },
  { id: 'c', name: 'Community', type: 4 },
  { id: 'a', name: 'news', type: 5 },
  { id: 's', name: 'stage', type: 13 },
  { id: 'f', name: 'help', type: 15 },
  { id: 'm', name: 'media', type: 16 },
  { id: 'u', name: 'mystery' }, // unknown type
];

const ids = (opts: ChannelPickerOption[]) => opts.map((o) => o.id);

describe('filterChannelOptions', () => {
  it('returns every option when kinds is undefined or empty', () => {
    expect(filterChannelOptions(options)).toBe(options);
    expect(filterChannelOptions(options, [])).toBe(options);
  });

  it("['text'] keeps type 0 and drops voice/category/announcement/stage/forum", () => {
    const out = ids(filterChannelOptions(options, ['text']));
    expect(out).toContain('t');
    for (const dropped of ['v', 'c', 'a', 's', 'f', 'm']) expect(out).not.toContain(dropped);
  });

  it('keeps options with an unknown (undefined) type so the raw-id fallback still works', () => {
    expect(ids(filterChannelOptions(options, ['text']))).toEqual(['t', 'u']);
    expect(ids(filterChannelOptions(options, ['category']))).toEqual(['c', 'u']);
  });

  it("['category'] keeps only categories (type 4) among typed options", () => {
    const typed = options.filter((o) => o.type !== undefined);
    expect(ids(filterChannelOptions(typed, ['category']))).toEqual(['c']);
  });

  it('unions multiple kinds and maps forum to both 15 and 16', () => {
    expect(ids(filterChannelOptions(options, ['text', 'announcement', 'forum', 'voice']))).toEqual([
      't',
      'v',
      'a',
      'f',
      'm',
      'u',
    ]);
    expect(CHANNEL_KIND_TYPES.forum).toEqual([15, 16]);
  });
});

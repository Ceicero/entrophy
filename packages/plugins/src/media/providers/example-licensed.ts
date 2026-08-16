import { MediaUnavailableError } from '../errors';
import type { MediaProvider, MediaProviderEnv, Track } from './types';

// -----------------------------------------------------------------------------------------------------------
// This is a DOCUMENTED INTEGRATION POINT, not a working provider. It shows the shape a real, compliant adapter
// would fill in — one built against a licensed streaming API/SDK whose terms of service actually permit bot
// playback (a label-direct API, a licensed music-API partner, a self-hosted/user-owned library server, etc).
// `isConfigured` always returns `false` here on purpose: shipping this "on" with no real backing API would
// either do nothing convincingly or invite someone to wire up an unlicensed scraper behind it, which is exactly
// what SPEC.md §I forbids ("no YouTube scraping, stream ripping, or copyright bypassing"). Wiring up a real
// provider means:
//   1. Pick a source whose API/ToS explicitly allow third-party bot/server playback.
//   2. Add its required env vars to `manifest.requiredEnv`/`optionalEnv` (e.g. `EXAMPLE_LICENSED_API_KEY`).
//   3. Implement `isConfigured` to check those env vars are present.
//   4. Implement `search`/`resolve` against that provider's real API (never local file scraping of a third
//      party's stream).
//   5. Implement `createStream` using `@discordjs/voice` (`createAudioResource`, a `VoiceConnection` joined via
//      `joinVoiceChannel`) — deliberately not implemented anywhere in this codebase yet.
// -----------------------------------------------------------------------------------------------------------

const TEMPLATE_MESSAGE =
  'The "example-licensed" provider is a template, not a working integration. Wire up `providers/example-licensed.ts` against a real, licensed streaming API before setting MEDIA_PROVIDER=example-licensed.';

export interface ExampleLicensedEnv extends MediaProviderEnv {
  EXAMPLE_LICENSED_API_KEY?: string;
}

export const exampleLicensedProvider: MediaProvider = {
  id: 'example-licensed',
  name: 'Example licensed provider (template)',
  isConfigured(env: MediaProviderEnv) {
    // Even if EXAMPLE_LICENSED_API_KEY were set, this template has no real API client behind it — always false
    // until someone actually implements search/resolve/createStream against a real, licensed API.
    void (env as ExampleLicensedEnv).EXAMPLE_LICENSED_API_KEY;
    return false;
  },
  async search(_query: string): Promise<Track[]> {
    throw new MediaUnavailableError(TEMPLATE_MESSAGE);
  },
  async resolve(_url: string): Promise<Track | null> {
    throw new MediaUnavailableError(TEMPLATE_MESSAGE);
  },
};

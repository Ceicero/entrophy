import { MediaUnavailableError } from '../errors';
import type { MediaProvider } from './types';

const NOT_CONFIGURED_MESSAGE =
  'No compliant media provider is configured (MEDIA_PROVIDER is unset or "none"). The music plugin stays unavailable until an admin configures one — see the plugin README for how to plug in a real adapter.';

/** The default provider (`MEDIA_PROVIDER` unset, empty, or `"none"`). Always reports unconfigured; every method explains why rather than doing anything. */
export const noneProvider: MediaProvider = {
  id: 'none',
  name: 'None (disabled)',
  isConfigured: () => false,
  async search() {
    throw new MediaUnavailableError(NOT_CONFIGURED_MESSAGE);
  },
  async resolve() {
    throw new MediaUnavailableError(NOT_CONFIGURED_MESSAGE);
  },
};

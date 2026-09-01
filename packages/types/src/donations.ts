/** DTOs for the public donations API. Donations are now hosted on Ko-fi. */

export interface DonationConfigDto {
  enabled: boolean;
  kofiUrl: string | null;
}

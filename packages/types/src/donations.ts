/** DTOs for the public donations API (ARCHITECTURE.md §18). */

export interface DonationPresetsDto {
  enabled: boolean;
  currency: 'usd';
  presetsCents: number[];
  minCents: number;
  maxCents: number;
}

export interface DonationCheckoutRequest {
  amountCents: number;
  currency: 'usd';
}

export interface DonationCheckoutResponse {
  url: string;
}

/** DTOs for the public donations API (ARCHITECTURE.md §18). */

export interface DonationPresetsDto {
  enabled: boolean;
  currency: 'usd';
  presetsCents: number[];
  minCents: number;
  maxCents: number;
  captchaProvider: 'hcaptcha' | 'turnstile' | null; // null when not configured
  captchaSiteKey: string | null; // public site key; null when not configured
}

export interface DonationCheckoutRequest {
  amountCents: number;
  currency: 'usd';
  captchaToken: string;
}

export interface DonationCheckoutResponse {
  url: string;
}

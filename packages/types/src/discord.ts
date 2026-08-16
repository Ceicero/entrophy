/**
 * A Discord snowflake id. Weakly branded: any `string` is assignable (the brand field is optional),
 * but code that wants to be explicit about "this is a Discord id" can use this alias.
 */
export type Snowflake = string & { readonly __brand?: 'Snowflake' };

/** A channel option for dashboard/command channel pickers. */
export interface DiscordChannelOption {
  id: Snowflake;
  name: string;
  type?: number;
}

/** A role option for dashboard/command role pickers. */
export interface DiscordRoleOption {
  id: Snowflake;
  name: string;
  type?: number;
}

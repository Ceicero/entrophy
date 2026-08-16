declare module 'safe-regex2' {
  export default function safeRegex(re: string | RegExp, opts?: { limit?: number }): boolean;
}

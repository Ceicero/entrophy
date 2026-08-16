declare module 'ioredis-mock' {
  import type Redis from 'ioredis';

  // ioredis-mock's default export is API-compatible with the real ioredis client for the subset of
  // commands this codebase uses; typed as `Redis` so mocked instances satisfy any code expecting a
  // real `ioredis` client. (Mirrors packages/core/src/types/ioredis-mock.d.ts — apps/api has its own
  // TS program and doesn't include that package's src, so it needs its own copy of this declaration.)
  export default class RedisMock extends Redis {}
}

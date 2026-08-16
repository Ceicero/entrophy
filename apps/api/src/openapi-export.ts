import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { createPrismaStub } from '@entrophy/plugins/sdk/testing';
import type { QueueRegistryLike } from './lib/queues';
import { buildApp } from './app';

/** Fake queue registry — the openapi export only needs the app to build and boot, never to actually enqueue anything. */
const fakeQueues: QueueRegistryLike = {
  get: () => ({ add: async () => undefined }),
  botActions: () => ({ add: async () => undefined }),
  integrationsInbound: () => ({ add: async () => undefined }),
  dataRequests: () => ({ add: async () => undefined }),
};

async function main(): Promise<void> {
  const { prisma } = createPrismaStub();
  const redis = new RedisMock() as unknown as Redis;

  const app = await buildApp({ prisma, redis, queues: fakeQueues });
  await app.ready();

  const spec = app.swagger();

  const here = path.dirname(fileURLToPath(import.meta.url));
  const docsDir = path.resolve(here, '../../../docs');
  await mkdir(docsDir, { recursive: true });
  const outPath = path.join(docsDir, 'openapi.json');
  await writeFile(outPath, JSON.stringify(spec, null, 2), 'utf8');

  // eslint-disable-next-line no-console -- CLI script output
  console.log(`Wrote ${outPath}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

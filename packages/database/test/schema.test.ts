import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Pure text check — no database connection required, so this runs in CI
// without postgres. Parses prisma/schema.prisma and asserts that every model
// declaring a `guildId` field also declares an index (or a unique constraint,
// which Postgres/Prisma also backs with an index) whose leading column is
// `guildId`, per docs/ARCHITECTURE.md §8 ("Every tenant table has `guildId` +
// `@@index([guildId])`").

const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
const schemaText = readFileSync(schemaPath, 'utf8');

interface ParsedModel {
  name: string;
  body: string;
}

function parseModels(schema: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(schema)) !== null) {
    models.push({ name: match[1], body: match[2] });
  }
  return models;
}

function hasGuildIdField(body: string): boolean {
  return /^\s*guildId\s+String/m.test(body);
}

function hasGuildIdLeadingIndex(body: string): boolean {
  return /@@(index|unique)\(\[\s*guildId\b/.test(body);
}

describe('prisma/schema.prisma', () => {
  const models = parseModels(schemaText);

  it('parses at least the models this package is responsible for', () => {
    expect(models.length).toBeGreaterThan(50);
  });

  const tenantModels = models.filter((m) => hasGuildIdField(m.body));

  it('finds tenant models with a guildId field', () => {
    expect(tenantModels.length).toBeGreaterThan(30);
  });

  it.each(tenantModels.map((m) => [m.name, m] as const))(
    '%s has an index (or unique constraint) led by guildId',
    (_name, model) => {
      expect(hasGuildIdLeadingIndex(model.body)).toBe(true);
    },
  );
});

import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { plugin } from '../index';

describe('ai plugin health()', () => {
  it('reports degraded, with a reason, when the Message Content intent is off (blocks /summarize and mention chat)', async () => {
    const { ctx } = createTestContext({ intentsEnabled: { messageContent: false } });
    const health = await plugin.health?.(ctx);
    expect(health?.status).toBe('degraded');
    expect(health?.details).toContain('Message Content');
  });

  it('reports ok when the Message Content intent is on', async () => {
    const { ctx } = createTestContext({ intentsEnabled: { messageContent: true } });
    const health = await plugin.health?.(ctx);
    expect(health).toEqual({ status: 'ok' });
  });
});

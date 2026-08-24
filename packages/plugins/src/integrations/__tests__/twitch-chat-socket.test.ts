import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EventSubSocket,
  type EventSubSocketCallbacks,
  type WebSocketConstructorLike,
  type WebSocketLike,
} from '../twitch-chat/socket';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  readyState = 1;
  closeCalls: { code?: number; reason?: string }[] = [];

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }

  /** Test helper: deliver an EventSub frame as if it arrived over the wire. */
  emit(messageType: string, payload: unknown): void {
    this.onmessage?.({
      data: JSON.stringify({
        metadata: { message_id: '1', message_type: messageType, message_timestamp: new Date().toISOString() },
        payload,
      }),
    });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }
}

const FakeWebSocketCtor = FakeWebSocket as unknown as WebSocketConstructorLike;

function makeCallbacks(): EventSubSocketCallbacks & {
  onWelcome: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
  onReconnect: ReturnType<typeof vi.fn>;
  onRevocation: ReturnType<typeof vi.fn>;
  onClosed: ReturnType<typeof vi.fn>;
} {
  return {
    onWelcome: vi.fn(),
    onNotification: vi.fn(),
    onReconnect: vi.fn(),
    onRevocation: vi.fn(),
    onClosed: vi.fn(),
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EventSubSocket', () => {
  it('parses session_welcome and reports the session id + keepalive timeout', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.emit('session_welcome', { session: { id: 'sess-1', status: 'connected', keepalive_timeout_seconds: 10, reconnect_url: null } });

    expect(callbacks.onWelcome).toHaveBeenCalledWith('sess-1', 10);
  });

  it('treats the socket as dead if no keepalive/notification arrives within timeout+5s', () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.emit('session_welcome', { session: { id: 'sess-1', status: 'connected', keepalive_timeout_seconds: 10, reconnect_url: null } });
    expect(callbacks.onClosed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000 + 5000 - 1);
    expect(callbacks.onClosed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(callbacks.onClosed).toHaveBeenCalledWith('keepalive timeout');
    // The socket closes the underlying transport on watchdog death too.
    expect(ws.closeCalls).toHaveLength(1);
  });

  it('tears itself down if session_welcome never arrives within the default keepalive window', () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    // Default is 10s + the 5s grace, before any session_welcome has told us the real per-session timeout.
    vi.advanceTimersByTime(10_000 + 5000 - 1);
    expect(callbacks.onClosed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(callbacks.onClosed).toHaveBeenCalledWith('keepalive timeout');
    expect(ws.closeCalls).toHaveLength(1);
  });

  it('session_keepalive frames reset the watchdog so the socket is not treated as dead', () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.emit('session_welcome', { session: { id: 'sess-1', status: 'connected', keepalive_timeout_seconds: 10, reconnect_url: null } });

    // Keep sending keepalives just under the watchdog window, well past what a single window would allow.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(12_000);
      ws.emit('session_keepalive', {});
    }
    expect(callbacks.onClosed).not.toHaveBeenCalled();
  });

  it('notification frames also reset the watchdog', () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.emit('session_welcome', { session: { id: 'sess-1', status: 'connected', keepalive_timeout_seconds: 10, reconnect_url: null } });
    vi.advanceTimersByTime(12_000);
    ws.emit('notification', { subscription: { id: 'sub-1', type: 'channel.chat.message', version: '1', status: 'enabled' }, event: {} });
    expect(callbacks.onClosed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(12_000);
    expect(callbacks.onClosed).not.toHaveBeenCalled(); // the notification above re-armed the watchdog
  });

  it('parses session_reconnect and reports the reconnect url without closing', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.emit('session_welcome', { session: { id: 'sess-1', status: 'connected', keepalive_timeout_seconds: 10, reconnect_url: null } });
    ws.emit('session_reconnect', {
      session: { id: 'sess-1', status: 'reconnecting', keepalive_timeout_seconds: null, reconnect_url: 'wss://example/ws?id=new' },
    });

    expect(callbacks.onReconnect).toHaveBeenCalledWith('wss://example/ws?id=new');
    expect(callbacks.onClosed).not.toHaveBeenCalled();
  });

  it('parses notification frames', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    const payload = {
      subscription: { id: 'sub-1', type: 'channel.chat.message', version: '1', status: 'enabled' },
      event: { broadcaster_user_id: 'b-1', chatter_user_id: 'c-1' },
    };
    ws.emit('notification', payload);

    expect(callbacks.onNotification).toHaveBeenCalledWith(payload);
  });

  it('parses revocation frames', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    const payload = { subscription: { id: 'sub-1', type: 'channel.chat.message', status: 'authorization_revoked' } };
    ws.emit('revocation', payload);

    expect(callbacks.onRevocation).toHaveBeenCalledWith(payload);
  });

  it('never throws on a malformed frame, and does not invoke any callback for it', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    expect(() => ws.emitRaw('not json{{{')).not.toThrow();
    expect(callbacks.onWelcome).not.toHaveBeenCalled();
    expect(callbacks.onNotification).not.toHaveBeenCalled();
  });

  it('ignores unrecognized message types instead of throwing', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    expect(() => ws.emit('some_future_message_type', {})).not.toThrow();
  });

  it('a remote close reports onClosed with the close reason', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.onclose?.({ code: 4003, reason: 'connection unused' });

    expect(callbacks.onClosed).toHaveBeenCalledTimes(1);
    expect(callbacks.onClosed.mock.calls[0][0]).toContain('4003');
  });

  it('close() tears down the transport but does NOT invoke onClosed (the caller already knows)', () => {
    const callbacks = makeCallbacks();
    const socket = new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    socket.close();

    expect(ws.closeCalls).toHaveLength(1);
    expect(callbacks.onClosed).not.toHaveBeenCalled();
  });

  it('a socket error reports onClosed exactly once', () => {
    const callbacks = makeCallbacks();
    new EventSubSocket('wss://example/ws', callbacks, FakeWebSocketCtor);
    const ws = FakeWebSocket.instances[0];

    ws.onerror?.(new Error('boom'));
    ws.onclose?.({ code: 1006, reason: '' }); // some runtimes fire both; must not double-report

    expect(callbacks.onClosed).toHaveBeenCalledTimes(1);
  });
});

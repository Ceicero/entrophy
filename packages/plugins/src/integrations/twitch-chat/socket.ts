// Thin, testable wrapper over Node 22's global `WebSocket` (undici-backed — see the ambient-declaration note
// below) implementing the EventSub WebSocket message protocol:
// https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
//
// Deliberately knows nothing about Twitch subscriptions, Helix, or Prisma — `TwitchChatManager` owns all of
// that. This class only: opens the socket, classifies incoming frames by `metadata.message_type`, runs the
// keepalive watchdog, and reports terminal state via `onClosed` exactly once.

/**
 * `@types/node` (22.10+, verified against the pinned `undici-types` here) declares `WebSocket`/`MessageEvent`
 * globally via `declare global` in its `web-globals/fetch.d.ts`, backed by Node's built-in (undici) WebSocket
 * client — no runtime dependency needed. This type alias exists only so a test can inject a fake constructor
 * without having to implement the full DOM-ish `WebSocket` interface (`binaryType`, `addEventListener`, etc.);
 * if a future `@types/node` ever stopped declaring the global, the real `WebSocket` constructor used at runtime
 * still structurally satisfies `WebSocketLike`, so no ambient declaration is required here.
 */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  readonly readyState: number;
  close(code?: number, reason?: string): void;
}

export type WebSocketConstructorLike = new (url: string) => WebSocketLike;

/** The real constructor to use in production; a plain reference to the global (Node 22+ built-in, no import). */
export const defaultWebSocketConstructor: WebSocketConstructorLike =
  WebSocket as unknown as WebSocketConstructorLike;

export const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

interface EventSubSessionWelcome {
  session: { id: string; status: string; keepalive_timeout_seconds: number; reconnect_url: string | null };
}
interface EventSubSessionReconnect {
  session: { id: string; status: string; keepalive_timeout_seconds: number | null; reconnect_url: string };
}
export interface EventSubNotification {
  subscription: { id: string; type: string; version: string; status: string };
  event: unknown;
}
export interface EventSubRevocation {
  subscription: { id: string; type: string; status: string };
}

interface EventSubFrame {
  metadata: { message_id: string; message_type: string; message_timestamp: string };
  payload: unknown;
}

export interface EventSubSocketCallbacks {
  onWelcome(sessionId: string, keepaliveTimeoutSeconds: number): void;
  onNotification(message: EventSubNotification): void;
  onReconnect(reconnectUrl: string): void;
  onRevocation(message: EventSubRevocation): void;
  /** Fired exactly once for a socket that dies unexpectedly (remote close, transport error, or the keepalive
   * watchdog firing) — never fired for a socket the caller closed itself via `close()`, since the caller
   * already knows it did that. */
  onClosed(reason: string): void;
}

/** Twitch's documented default before the first `session_welcome` arrives (welcome itself always carries the
 * real value, which then governs every keepalive/notification frame after it). */
const DEFAULT_KEEPALIVE_TIMEOUT_SECONDS = 10;
/** "no keepalive/notification within timeout+5s → treat as dead" (spec / Twitch's own guidance). */
const KEEPALIVE_GRACE_MS = 5000;

export class EventSubSocket {
  private ws: WebSocketLike;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimeoutSeconds = DEFAULT_KEEPALIVE_TIMEOUT_SECONDS;
  private closed = false;
  private suppressClosedCallback = false;

  constructor(
    url: string,
    private readonly callbacks: EventSubSocketCallbacks,
    WebSocketCtor: WebSocketConstructorLike = defaultWebSocketConstructor,
  ) {
    this.ws = new WebSocketCtor(url);
    this.ws.onmessage = (ev) => this.handleFrame(ev.data);
    this.ws.onclose = (ev) => this.teardown(`remote close (${ev.code}) ${ev.reason}`.trim());
    this.ws.onerror = () => this.teardown('socket error');
    // Twitch never expects anything sent on this socket before session_welcome, and never at all after — no
    // onopen handling needed.
    // Arm the watchdog immediately, using the documented default timeout, so a socket that connects at the
    // transport level but never receives `session_welcome` (a stalled/black-holed connection) still gets torn
    // down instead of hanging forever — `session_welcome` itself re-arms with Twitch's real per-session value.
    this.armKeepaliveWatchdog();
  }

  /** Closes the socket without reporting it via `onClosed` (the caller is the one retiring it — e.g. the manager
   * following a `session_reconnect`, or `stop()` — and already knows). */
  close(): void {
    this.suppressClosedCallback = true;
    this.teardown('closed by caller');
  }

  private teardown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.clearKeepaliveWatchdog();
    try {
      this.ws.close();
    } catch {
      // Already closed/erroring — nothing more to do.
    }
    if (!this.suppressClosedCallback) this.callbacks.onClosed(reason);
  }

  private armKeepaliveWatchdog(timeoutSeconds?: number): void {
    if (typeof timeoutSeconds === 'number') this.keepaliveTimeoutSeconds = timeoutSeconds;
    this.clearKeepaliveWatchdog();
    const timeoutMs = this.keepaliveTimeoutSeconds * 1000 + KEEPALIVE_GRACE_MS;
    this.keepaliveTimer = setTimeout(() => this.teardown('keepalive timeout'), timeoutMs);
  }

  private clearKeepaliveWatchdog(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private handleFrame(raw: unknown): void {
    let frame: EventSubFrame;
    try {
      frame = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as EventSubFrame;
    } catch {
      return; // Malformed frame — never let a parse failure kill the connection.
    }

    try {
      switch (frame.metadata.message_type) {
        case 'session_welcome': {
          const payload = frame.payload as EventSubSessionWelcome;
          this.armKeepaliveWatchdog(payload.session.keepalive_timeout_seconds);
          this.callbacks.onWelcome(payload.session.id, payload.session.keepalive_timeout_seconds);
          break;
        }
        case 'session_keepalive': {
          this.armKeepaliveWatchdog();
          break;
        }
        case 'session_reconnect': {
          const payload = frame.payload as EventSubSessionReconnect;
          this.clearKeepaliveWatchdog();
          this.callbacks.onReconnect(payload.session.reconnect_url);
          break;
        }
        case 'notification': {
          this.armKeepaliveWatchdog();
          this.callbacks.onNotification(frame.payload as EventSubNotification);
          break;
        }
        case 'revocation': {
          this.callbacks.onRevocation(frame.payload as EventSubRevocation);
          break;
        }
        default:
          break; // Forward-compatible: an unrecognized message type is ignored, never fatal.
      }
    } catch {
      // A handler exception must never kill the socket loop (spec's own rule, restated at the socket level too).
    }
  }
}

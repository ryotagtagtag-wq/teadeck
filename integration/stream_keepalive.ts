/**
 * Hardens upstream's streaming WebSocket (@gamestdio/websocket 0.3.2).
 * Upstream already reconnects after a close and then resubscribes and fills
 * timeline gaps, but the library's backoff is `random × 2^attempt × 100 ms`
 * with no upper bound and an attempt counter that is never reset, so after a
 * few outages in a long session the next reconnect could be hours away. It
 * also does not react to network changes, after which a socket can look open
 * while it is dead.
 *
 * Deliberately no reconnect when a hidden tab becomes visible again: that
 * dropped a working connection on every longer tab switch.
 */

const baseDelayMs = 1_000;
const maxDelayMs = 30_000;

/** Delay before reconnect attempt `attempt` (1-based): randomized exponential, 1 s base, at most 30 s. */
export function reconnectDelay(attempt: number, random = Math.random()) {
  return Math.min(maxDelayMs, Math.floor(random * 2 ** attempt * baseDelayMs));
}

/** The library internals this relies on (lib/index.js and lib/backoff.js of @gamestdio/websocket 0.3.2). */
export interface ReconnectingSocket {
  ws: WebSocket;
  reconnectEnabled: boolean;
  backoff: { attempts: number; func: (attempt: number, delay: number) => number };
  onOpenCallback: (...args: unknown[]) => void;
}

export function keepStreamingAlive(client: ReconnectingSocket, target: Window = window) {
  client.backoff.func = (attempt) => reconnectDelay(attempt);

  // Reconnects bind `this.onOpenCallback` anew, so an instance override applies to them.
  const onOpen = client.onOpenCallback;
  client.onOpenCallback = function onOpenAndResetBackoff(...args: unknown[]) {
    client.backoff.attempts = 0;
    onOpen.apply(client, args);
  };

  // Closing only the underlying socket (not client.close(), which disables
  // reconnecting) runs upstream's normal path: disconnect, reconnect,
  // resubscribe, load what was missed.
  const restart = () => {
    if (client.reconnectEnabled && client.ws.readyState === WebSocket.OPEN) client.ws.close(1000, 'reconnect after network change');
  };

  target.addEventListener('online', restart);
}

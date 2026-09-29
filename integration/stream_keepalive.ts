/**
 * The streaming library's reconnect delay grows without limit and is never
 * reset, so after a few outages the next attempt could be hours away. This caps
 * it, resets it after a successful connect and reconnects when the network
 * comes back.
 */

const baseDelayMs = 1_000;
const maxDelayMs = 30_000;

/** Randomized exponential delay for the 1-based `attempt`, at most 30 s. */
export function reconnectDelay(attempt: number, random = Math.random()) {
  return Math.min(maxDelayMs, Math.floor(random * 2 ** attempt * baseDelayMs));
}

/** The internals of @gamestdio/websocket this relies on. */
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

  // Closing only the socket (client.close() would stop reconnecting) runs
  // upstream's usual reconnect, resubscribe and catch-up.
  const restart = () => {
    if (client.reconnectEnabled && client.ws.readyState === WebSocket.OPEN) client.ws.close(1000, 'reconnect after network change');
  };

  target.addEventListener('online', restart);
}

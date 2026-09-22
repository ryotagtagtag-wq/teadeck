/**
 * MVP fallback when no streaming endpoint is available: periodically re-fetch
 * the home timeline's newest items instead of a live WebSocket/EventSource
 * connection. Deliberately limited, not full parity with streaming: only the
 * home timeline, and running regardless of which columns are mounted (real
 * streaming connects/disconnects per visible column). No new backend.
 */
export function startHomeTimelinePolling(
  dispatch: (action: unknown) => unknown,
  expandHomeTimeline: () => unknown,
  intervalMs = 30_000,
): () => void {
  const id = setInterval(() => { dispatch(expandHomeTimeline()); }, intervalMs);
  return () => clearInterval(id);
}

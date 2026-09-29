/** Without a streaming endpoint, the home timeline is refreshed periodically instead. */
export function startHomeTimelinePolling(
  dispatch: (action: unknown) => unknown,
  expandHomeTimeline: () => unknown,
  intervalMs = 30_000,
): () => void {
  const id = setInterval(() => { dispatch(expandHomeTimeline()); }, intervalMs);
  return () => clearInterval(id);
}

/**
 * Teadeck's own modals, by the id Mastodon's openModal() takes. modal_root.jsx
 * adds them to its list, so a new one needs no further change there; each
 * loads on first use, like Mastodon's.
 */
export const teadeckModalComponents = {
  TEADECK_STATUS: () => import('./status_overlay_modal.tsx'),
  TEADECK_MARKDOWN_HELP: () => import('./markdown_cheatsheet.tsx'),
};

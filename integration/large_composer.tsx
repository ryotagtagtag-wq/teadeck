/**
 * The large composer: upstream's composer with all its settings, shown in the
 * middle of the window at the size of the status overlay, for longer posts.
 * With Markdown on, a preview of the post follows the text. It opens from the
 * right part of the "New post" button and switches to and from the regular
 * composer in the composer's header; the text and settings stay as they are.
 */

import { createElement, useCallback, useMemo, useSyncExternalStore } from 'react';

import { CornersInIcon, CornersOutIcon, PenNibIcon } from '@phosphor-icons/react';

import { openModal } from '@/mastodon/actions/modal';
import { Button, IconButton } from '@/mastodon/components/button/redesign';
import { EmojiHTML } from '@/mastodon/components/emoji/html';
import { initialState } from '@/mastodon/initial_state';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';
import type { OnElementHandler } from '@/mastodon/utils/html';

import { CodeBlock } from './code_block';
import type { StatusFormat } from './gotosocial';
import { accountStatusFormat, effectiveStatusFormat } from './gotosocial';
import { renderMarkdown } from './markdown';
import { currentUiTextLocale, t } from './settings_strings';
import './large_composer.css';

let large = false;
const listeners = new Set<() => void>();

export function setComposerLarge(value: boolean) {
  if (large === value) return;
  large = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useComposerLarge(): boolean {
  return useSyncExternalStore(subscribe, () => large);
}

/**
 * Upstream's "New post" button with a second part after a divider: the left
 * part opens the regular composer, the right one the large composer.
 */
export const NewPostSplitButton: React.FC<{ onOpen: () => void; className?: string; children: React.ReactNode }> = ({ onOpen, className, children }) => {
  const openRegular = useCallback(() => { setComposerLarge(false); onOpen(); }, [onOpen]);
  const openLarge = useCallback(() => { setComposerLarge(true); onOpen(); }, [onOpen]);
  return (
    <div className={`teadeck-new-post ${className ?? ''}`}>
      <Button leadingIcon={PenNibIcon} onClick={openRegular} variant='solid' color='accent' size='md' className='teadeck-new-post__main'>
        {children}
      </Button>
      <IconButton icon={CornersOutIcon} onClick={openLarge} variant='solid' color='accent' size='md' className='teadeck-new-post__large'>
        {t('newPostLarge', currentUiTextLocale())}
      </IconButton>
    </div>
  );
};

/** In the composer's header: from the regular to the large composer and back. */
export const ComposerSizeToggle: React.FC = () => {
  const isLarge = useComposerLarge();
  const toggle = useCallback(() => { setComposerLarge(!large); }, []);
  return (
    <IconButton size='sm' variant='ghost' icon={isLarge ? CornersInIcon : CornersOutIcon} onClick={toggle} tooltipPlacement='top' className='teadeck-composer-size-toggle'>
      {t(isLarge ? 'composerNormal' : 'composerLarge', currentUiTextLocale())}
    </IconButton>
  );
};

// Code blocks as in posts: language, line numbers, highlighting, copy button.
const onElement: OnElementHandler = (element, { key }) => (
  element instanceof HTMLPreElement ? createElement(CodeBlock, { element, key: key as React.Key }) : undefined
);

/** Markdown rendered the way posts show it, for the preview and the cheat sheet. */
export const MarkdownView: React.FC<{ source: string }> = ({ source }) => {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <EmojiHTML className='status__content__text teadeck-markdown-view' htmlString={html} onElement={onElement} />;
};

/** Below the text in the large composer, while the post is written in Markdown. */
export const ComposerMarkdownPreview: React.FC = () => {
  const isLarge = useComposerLarge();
  const text = useAppSelector((state) => state.compose.get('text') as string);
  const chosen = useAppSelector((state) => state.compose.get('content_type', 'default') as StatusFormat);
  const dispatch = useAppDispatch();
  const openHelp = useCallback(() => {
    dispatch(openModal({ modalType: 'TEADECK_MARKDOWN_HELP', modalProps: {} }));
  }, [dispatch]);

  const meta = initialState?.meta as { teadeck_status_format?: boolean; teadeck_status_content_type?: unknown } | undefined;
  const markdown = Boolean(meta?.teadeck_status_format)
    && effectiveStatusFormat(chosen, accountStatusFormat(meta?.teadeck_status_content_type)) === 'markdown';
  if (!isLarge || !markdown) return null;

  const locale = currentUiTextLocale();
  return (
    <section className='teadeck-markdown-preview' aria-label={t('markdownPreview', locale)}>
      <header className='teadeck-markdown-preview__header'>
        <h3>{t('markdownPreview', locale)}</h3>
        <span>{t('markdownPreviewHint', locale)}</span>
        <button type='button' className='link-button teadeck-markdown-preview__help' onClick={openHelp}>
          {t('markdownHelp', locale)}
        </button>
      </header>
      {text.trim() ? <MarkdownView source={text} /> : <p className='teadeck-markdown-preview__empty'>{t('markdownPreviewEmpty', locale)}</p>}
    </section>
  );
};

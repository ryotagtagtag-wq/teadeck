/**
 * The large composer is upstream's composer, only placed differently
 * (large_composer.css), so switching sizes keeps the post as it is.
 */

import { createElement, useCallback, useMemo } from 'react';

import { CornersInIcon, CornersOutIcon, PenNibIcon } from '@phosphor-icons/react';

import { openModal } from '@/mastodon/actions/modal';
import { Button, IconButton } from '@/mastodon/components/button/redesign';
import { EmojiHTML } from '@/mastodon/components/emoji/html';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';
import type { OnElementHandler } from '@/mastodon/utils/html';

import { CodeBlock } from './code_block.tsx';
import { accountStatusContentType, statusFormatAvailable } from './server_features.ts';
import type { StatusFormat } from './status_format.ts';
import { accountStatusFormat, effectiveStatusFormat } from './status_format.ts';
import { createExternalState } from './external_state.ts';
import { renderMarkdown } from './markdown.ts';
import { t } from './i18n.ts';
import './large_composer.css';

const large = createExternalState(() => false);

const setComposerLarge = large.set;
export const useComposerLarge = large.use;

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
        {t('newPostLarge')}
      </IconButton>
    </div>
  );
};

/** In the composer's header: from the regular to the large composer and back. */
export const ComposerSizeToggle: React.FC = () => {
  const isLarge = useComposerLarge();
  const toggle = useCallback(() => { setComposerLarge(!large.get()); }, []);
  return (
    <IconButton size='sm' variant='ghost' icon={isLarge ? CornersInIcon : CornersOutIcon} onClick={toggle} tooltipPlacement='top' className='teadeck-composer-size-toggle'>
      {t(isLarge ? 'composerNormal' : 'composerLarge')}
    </IconButton>
  );
};

/** Behind the large composer: a click beside it turns it into the regular one, keeping the post. */
export const LargeComposerBackdrop: React.FC = () => {
  const shrink = useCallback(() => { setComposerLarge(false); }, []);
  return <div className='teadeck-large-composer__backdrop' onClick={shrink} aria-hidden='true' />;
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

  const markdown = statusFormatAvailable()
    && effectiveStatusFormat(chosen, accountStatusFormat(accountStatusContentType())) === 'markdown';
  if (!isLarge || !markdown) return null;

  return (
    <section className='teadeck-markdown-preview' aria-label={t('markdownPreview')}>
      <header className='teadeck-markdown-preview__header'>
        <h3>{t('markdownPreview')}</h3>
        <span>{t('markdownPreviewHint')}</span>
        <button type='button' className='link-button teadeck-markdown-preview__help' onClick={openHelp}>
          {t('markdownHelp')}
        </button>
      </header>
      {text.trim() ? <MarkdownView source={text} /> : <p className='teadeck-markdown-preview__empty'>{t('markdownPreviewEmpty')}</p>}
    </section>
  );
};

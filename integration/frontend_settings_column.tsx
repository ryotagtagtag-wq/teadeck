import { useCallback, useMemo, useState } from 'react';

import SettingsIcon from '@/material-icons/400-24px/settings.svg?react';
import { Button } from '@/mastodon/components/button';
import { Column } from '@/mastodon/components/column';
import { ColumnHeader } from '@/mastodon/components/column/header';
import {
  FormStack,
  SelectField,
  ToggleField,
} from '@/mastodon/components/form_fields';
import {
  autoPlayGif,
  boostModal,
  deleteModal,
  disableHoverCards,
  disableSwiping,
  displayMedia,
  emojiStyle,
  expandSpoilers,
  forceSingleColumn,
  missingAltTextModal,
  reduceMotion,
  useBlurhash,
  usePendingItems,
} from '@/mastodon/initial_state';

import { changeSetting } from '@/mastodon/actions/settings';
import { useAppDispatch } from '@/mastodon/store';

import { appliedAppearance, applyAppearance } from './appearance.ts';
import type { ColorScheme, Contrast, DisplayMedia, EmojiStyle, FrontendSettings, Theme } from './frontend_settings.ts';
import { frontendSettingsKey, resolveFrontendSettings } from './frontend_settings.ts';
import type { NotificationShows } from './notification_settings.ts';
import { readNotificationShows } from './notification_settings.ts';
import { currentLocale, t } from './i18n.ts';
import { designs } from './themes/index.ts';
import { designLabel } from './themes/tokens.ts';
import { setStatusOverlayEnabled, statusOverlayEnabled } from './status_overlay.tsx';
import { readObjectPreference, readSettings, readPreference, writePreference } from './storage.ts';
import { availableLocales } from './ui_locale.ts';

type BooleanSettingKey = Exclude<keyof FrontendSettings, 'displayMedia' | 'colorScheme' | 'contrast' | 'emojiStyle' | 'theme'>;

const storedChoices = () => readObjectPreference(frontendSettingsKey);

/** Read each time the page opens: settings may have changed since, here or in another tab. */
function settingsNow(): FrontendSettings {
  return resolveFrontendSettings(storedChoices(), appliedAppearance() ?? settingsAtStart());
}

/** What the page started with, before boot() applied anything. */
const settingsAtStart = (): FrontendSettings => ({
  autoPlayGif: Boolean(autoPlayGif),
  displayMedia: (displayMedia as DisplayMedia | undefined) ?? 'default',
  expandSpoilers: Boolean(expandSpoilers),
  reduceMotion: Boolean(reduceMotion),
  useBlurhash: Boolean(useBlurhash),
  usePendingItems: Boolean(usePendingItems),
  boostModal: Boolean(boostModal),
  deleteModal: Boolean(deleteModal),
  missingAltTextModal: Boolean(missingAltTextModal),
  // Not in meta: appearance.ts applies these to <html>. Stored choices replace them.
  theme: 'assam',
  colorScheme: 'auto',
  contrast: 'auto',
  useSystemFont: false,
  useSystemScrollbars: false,
  emojiStyle: (emojiStyle as EmojiStyle | undefined) ?? 'auto',
  disableSwiping: Boolean(disableSwiping),
  disableHoverCards: Boolean(disableHoverCards),
});

function localeNameLookup() {
  try { return new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' }); }
  catch { return undefined; }
}

const FrontendSettingsColumn: React.FC<{ multiColumn?: boolean }> = ({ multiColumn }) => {
  const [settings, setSettings] = useState(settingsNow);
  const [advancedLayout, setAdvancedLayout] = useState(() => readPreference('advancedLayout', !forceSingleColumn));
  const [uiLocale, setUiLocale] = useState(() => document.documentElement.lang || 'en');
  const [statusOverlay, setStatusOverlay] = useState(statusOverlayEnabled);
  const [notifications, setNotifications] = useState<NotificationShows>(() => readNotificationShows(readSettings()));

  const [reloadNeeded, setReloadNeeded] = useState(false);
  const dispatch = useAppDispatch();

  const localeNames = useMemo(localeNameLookup, []);

  // Saved at once. Settings upstream reads only at startup offer a reload.
  const change = useCallback((patch: Partial<FrontendSettings>, { instant = false } = {}) => {
    setSettings((previous) => {
      // Only the change is written on top of what is stored, so settings never
      // chosen keep following the defaults.
      const chosen = { ...storedChoices(), ...patch };
      writePreference(frontendSettingsKey, chosen);
      const next = resolveFrontendSettings(chosen, previous);
      applyAppearance(next, document.documentElement.lang || 'en');
      return next;
    });
    if (!instant) setReloadNeeded(true);
  }, []);

  const toggles = useMemo((): { key: BooleanSettingKey; label: string; hint?: string }[] => [
    { key: 'expandSpoilers', label: t('expandSpoilers') },
    { key: 'autoPlayGif', label: t('autoPlayGif') },
    { key: 'useBlurhash', label: t('useBlurhash') },
    { key: 'reduceMotion', label: t('reduceMotion') },
    { key: 'usePendingItems', label: t('usePendingItems'), hint: t('usePendingItemsHint') },
    { key: 'boostModal', label: t('boostModal') },
    { key: 'deleteModal', label: t('deleteModal') },
    { key: 'missingAltTextModal', label: t('missingAltTextModal') },
    { key: 'disableSwiping', label: t('disableSwiping') },
    { key: 'disableHoverCards', label: t('disableHoverCards') },
    { key: 'useSystemFont', label: t('useSystemFont') },
    { key: 'useSystemScrollbars', label: t('useSystemScrollbars') },
  ], []);

  const notificationToggles = useMemo(() => [
    { key: 'follow' as const, label: t('notifyFollow') },
    { key: 'follow_request' as const, label: t('notifyFollowRequest') },
    { key: 'reblog' as const, label: t('notifyReblog') },
    { key: 'favourite' as const, label: t('notifyFavourite') },
    { key: 'mention' as const, label: t('notifyMention') },
    { key: 'quote' as const, label: t('notifyQuote') },
  ], []);

  // Only a class on <html>, so they apply at once.
  const instantKeys = new Set<BooleanSettingKey>(['useSystemFont', 'useSystemScrollbars']);

  const handleToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    change({ [name]: checked } as Partial<FrontendSettings>, { instant: instantKeys.has(name as BooleanSettingKey) });
  }, [change]);

  // Upstream's own setting, so it goes through upstream's action.
  const handleNotificationToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setNotifications(previous => ({ ...previous, [name as keyof NotificationShows]: checked }));
    dispatch(changeSetting(['notifications', 'shows', name], checked));
  }, [dispatch]);

  const handleDisplayMedia = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    change({ displayMedia: event.target.value as DisplayMedia });
  }, [change]);

  const handleTheme = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    change({ theme: event.target.value as Theme }, { instant: true });
  }, [change]);

  const handleColorScheme = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    change({ colorScheme: event.target.value as ColorScheme }, { instant: true });
  }, [change]);

  const handleContrast = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    change({ contrast: event.target.value as Contrast }, { instant: true });
  }, [change]);

  const handleEmojiStyle = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    change({ emojiStyle: event.target.value as EmojiStyle });
  }, [change]);

  const handleLayout = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const advanced = event.target.value === 'advanced';
    setAdvancedLayout(advanced);
    writePreference('advancedLayout', advanced);
    setReloadNeeded(true);
  }, []);

  const handleLocale = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setUiLocale(value);
    writePreference('locale', value);
    document.documentElement.lang = value;
    setReloadNeeded(true);
  }, []);

  const handleStatusOverlay = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setStatusOverlay(event.target.checked);
    setStatusOverlayEnabled(event.target.checked);
  }, []);

  const reloadNow = useCallback(() => {
    location.assign(advancedLayout ? '/deck/preferences' : '/preferences');
  }, [advancedLayout]);

  return (
    <Column bindToDocument={!multiColumn} label={t('title')}>
      <ColumnHeader
        title={t('title')}
        icon='cog'
        iconComponent={SettingsIcon}
        multiColumn={multiColumn}
        showBackButton
      />

      <div className='scrollable'>
        <FormStack>
          <p>{t('intro')}</p>

          <SelectField id='teadeck-settings-layout' label={t('layout')} value={advancedLayout ? 'advanced' : 'simple'} onChange={handleLayout}>
            <option value='simple'>{t('layoutSimple')}</option>
            <option value='advanced'>{t('layoutAdvanced')}</option>
          </SelectField>

          <ToggleField
            id='teadeck-settings-status-overlay'
            name='statusOverlay'
            label={t('statusOverlay')}
            hint={t('statusOverlayHint')}
            checked={statusOverlay}
            onChange={handleStatusOverlay}
          />

          <SelectField id='teadeck-settings-locale' label={t('language')} value={uiLocale} onChange={handleLocale}>
            {availableLocales.map(code => (
              <option key={code} value={code}>{localeNames?.of(code) ?? code}</option>
            ))}
          </SelectField>

          <h3 className='teadeck-settings__section'>{t('appearance')}</h3>

          <SelectField id='teadeck-settings-theme' label={t('theme')} hint={t('themeHint')} value={settings.theme} onChange={handleTheme}>
            <option value='mastodon'>{t('themeMastodon')}</option>
            {designs.map(design => (
              <option key={design.id} value={design.id}>{designLabel(design, currentLocale())}</option>
            ))}
          </SelectField>

          <SelectField id='teadeck-settings-color-scheme' label={t('colorScheme')} value={settings.colorScheme} onChange={handleColorScheme}>
            <option value='auto'>{t('colorSchemeAuto')}</option>
            <option value='light'>{t('colorSchemeLight')}</option>
            <option value='dark'>{t('colorSchemeDark')}</option>
          </SelectField>

          <SelectField id='teadeck-settings-contrast' label={t('contrast')} value={settings.contrast} onChange={handleContrast}>
            <option value='auto'>{t('contrastAuto')}</option>
            <option value='high'>{t('contrastHigh')}</option>
          </SelectField>

          <SelectField id='teadeck-settings-emoji-style' label={t('emojiStyle')} value={settings.emojiStyle} onChange={handleEmojiStyle}>
            <option value='auto'>{t('emojiStyleAuto')}</option>
            <option value='native'>{t('emojiStyleNative')}</option>
            <option value='twemoji'>{t('emojiStyleTwemoji')}</option>
          </SelectField>

          <SelectField id='teadeck-settings-display-media' label={t('displayMedia')} value={settings.displayMedia} onChange={handleDisplayMedia}>
            <option value='default'>{t('displayMediaDefault')}</option>
            <option value='show_all'>{t('displayMediaShowAll')}</option>
            <option value='hide_all'>{t('displayMediaHideAll')}</option>
          </SelectField>

          {toggles.map(({ key, label, hint }) => (
            <ToggleField
              key={key}
              id={`teadeck-settings-${key}`}
              name={key}
              label={label}
              hint={hint}
              checked={settings[key]}
              onChange={handleToggle}
            />
          ))}

          <h3 className='teadeck-settings__section'>{t('notifications')}</h3>
          <p>{t('notificationsHint')}</p>

          {notificationToggles.map(({ key, label }) => (
            <ToggleField
              key={key}
              id={`teadeck-settings-notify-${key}`}
              name={key}
              label={label}
              checked={notifications[key]}
              onChange={handleNotificationToggle}
            />
          ))}

          {reloadNeeded && (
            <div id='teadeck-settings-reload'>
              <p>{t('reloadHint')}</p>
              <Button onClick={reloadNow} text={t('reloadNow')} />
            </div>
          )}
        </FormStack>
      </div>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export -- loaded through upstream's async route bundles
export default FrontendSettingsColumn;

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

import { appliedAppearance, applyAppearance } from './appearance';
import type { ColorScheme, Contrast, DisplayMedia, EmojiStyle, FrontendSettings, Theme } from './frontend_settings';
import { frontendSettingsKey, resolveFrontendSettings } from './frontend_settings';
import type { NotificationShows } from './notification_settings';
import { readNotificationShows } from './notification_settings';
import { t, uiTextLocale } from './settings_strings';
import { setStatusOverlayEnabled, statusOverlayEnabled } from './status_overlay';
import { readSettings, readPreference, writePreference } from './storage';
import { availableLocales } from './ui_locale';

type BooleanSettingKey = Exclude<keyof FrontendSettings, 'displayMedia' | 'colorScheme' | 'contrast' | 'emojiStyle' | 'theme'>;

/** A stored object, or nothing if what is stored is not one. */
function storedChoices(): Record<string, unknown> {
  const stored = readPreference<unknown>(frontendSettingsKey, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
}

/**
 * The settings as they are when the page opens - not as they were when this
 * module first loaded. The page can be opened many times in one session, and
 * settings change in between, here or in another tab. Stored choices win;
 * anything never chosen is what this tab is running with.
 */
function settingsNow(): FrontendSettings {
  return resolveFrontendSettings(storedChoices(), appliedAppearance() ?? settingsAtStart());
}

/** Only needed before boot() applied anything: what the page was started with. */
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

// Matches upstream's own `.simple_form h3` (forms.scss) used for section
// headings on the real settings pages; this form isn't a Rails simple_form,
// so a bare <h3> would otherwise pick up no styling at all (reset.scss zeroes
// heading styles globally) and read as plain body text.
const sectionHeadingStyle: React.CSSProperties = { fontSize: '20px', fontWeight: 600, marginBottom: '16px' };

function timeZones(): string[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (supportedValuesOf) {
    try { return supportedValuesOf('timeZone'); } catch { /* fall through to the browser's own zone only */ }
  }
  return [Intl.DateTimeFormat().resolvedOptions().timeZone];
}

function localeNameLookup() {
  try { return new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' }); }
  catch { return undefined; }
}

const FrontendSettingsColumn: React.FC<{ multiColumn?: boolean }> = ({ multiColumn }) => {
  // Everything is read when the page opens, not when the module first loaded.
  const [settings, setSettings] = useState(settingsNow);
  const [advancedLayout, setAdvancedLayout] = useState(() => readPreference('advancedLayout', !forceSingleColumn));
  const [uiLocale, setUiLocale] = useState(() => document.documentElement.lang || 'en');
  const locale = uiTextLocale(uiLocale);
  const [statusOverlay, setStatusOverlay] = useState(statusOverlayEnabled);
  const [timezone, setTimezone] = useState(() => readPreference('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [notifications, setNotifications] = useState<NotificationShows>(() => readNotificationShows(readSettings()));

  const [reloadNeeded, setReloadNeeded] = useState(false);
  const dispatch = useAppDispatch();

  const localeNames = useMemo(localeNameLookup, []);
  const zones = useMemo(timeZones, []);

  /**
   * Keeps a change right away. Colours, contrast, fonts, scrollbars and motion
   * are applied to the page at the same moment; the rest upstream reads once at
   * startup, so those only show after a reload - offered as a button instead of
   * reloading under the reader's hands.
   */
  const change = useCallback((patch: Partial<FrontendSettings>, { instant = false } = {}) => {
    setSettings((previous) => {
      // Only this change is written, on top of what is stored now: a choice made
      // in another tab meanwhile survives, and settings never chosen keep
      // following the defaults instead of being frozen at today's values.
      const chosen = { ...storedChoices(), ...patch };
      writePreference(frontendSettingsKey, chosen);
      const next = resolveFrontendSettings(chosen, previous);
      applyAppearance(next, document.documentElement.lang || 'en');
      return next;
    });
    if (!instant) setReloadNeeded(true);
  }, []);

  const toggles = useMemo((): { key: BooleanSettingKey; label: string; hint?: string }[] => [
    { key: 'expandSpoilers', label: t('expandSpoilers', locale) },
    { key: 'autoPlayGif', label: t('autoPlayGif', locale) },
    { key: 'useBlurhash', label: t('useBlurhash', locale) },
    { key: 'reduceMotion', label: t('reduceMotion', locale) },
    { key: 'usePendingItems', label: t('usePendingItems', locale), hint: t('usePendingItemsHint', locale) },
    { key: 'boostModal', label: t('boostModal', locale) },
    { key: 'deleteModal', label: t('deleteModal', locale) },
    { key: 'missingAltTextModal', label: t('missingAltTextModal', locale) },
    { key: 'disableSwiping', label: t('disableSwiping', locale) },
    { key: 'disableHoverCards', label: t('disableHoverCards', locale) },
    { key: 'useSystemFont', label: t('useSystemFont', locale) },
    { key: 'useSystemScrollbars', label: t('useSystemScrollbars', locale) },
  ], [locale]);

  const notificationToggles = useMemo(() => [
    { key: 'follow' as const, label: t('notifyFollow', locale) },
    { key: 'follow_request' as const, label: t('notifyFollowRequest', locale) },
    { key: 'reblog' as const, label: t('notifyReblog', locale) },
    { key: 'favourite' as const, label: t('notifyFavourite', locale) },
    { key: 'mention' as const, label: t('notifyMention', locale) },
    { key: 'quote' as const, label: t('notifyQuote', locale) },
  ], [locale]);

  // These two are only a class or an attribute on <html>, so they take effect at once.
  const instantKeys = new Set<BooleanSettingKey>(['useSystemFont', 'useSystemScrollbars']);

  const handleToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    change({ [name]: checked } as Partial<FrontendSettings>, { instant: instantKeys.has(name as BooleanSettingKey) });
  }, [change]);

  /**
   * Which notifications appear is upstream's own setting, so it goes through
   * upstream's own action: the column follows immediately, and it is stored in
   * the same place as before.
   */
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
    // This page's own texts follow at once; upstream's translations are loaded at startup.
    document.documentElement.lang = value;
    setReloadNeeded(true);
  }, []);

  const handleTimezone = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setTimezone(value);
    writePreference('timezone', value);
    setReloadNeeded(true);
  }, []);

  // Takes effect at once, in every post already on screen.
  const handleStatusOverlay = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setStatusOverlay(event.target.checked);
    setStatusOverlayEnabled(event.target.checked);
  }, []);

  const reloadNow = useCallback(() => {
    location.assign(advancedLayout ? '/deck/preferences' : '/preferences');
  }, [advancedLayout]);

  return (
    <Column bindToDocument={!multiColumn} label={t('title', locale)}>
      <ColumnHeader
        title={t('title', locale)}
        icon='cog'
        iconComponent={SettingsIcon}
        multiColumn={multiColumn}
        showBackButton
      />

      <div className='scrollable'>
        <FormStack>
          <p>{t('intro', locale)}</p>

          <SelectField id='teadeck-settings-layout' label={t('layout', locale)} value={advancedLayout ? 'advanced' : 'simple'} onChange={handleLayout}>
            <option value='simple'>{t('layoutSimple', locale)}</option>
            <option value='advanced'>{t('layoutAdvanced', locale)}</option>
          </SelectField>

          <ToggleField
            id='teadeck-settings-status-overlay'
            name='statusOverlay'
            label={t('statusOverlay', locale)}
            hint={t('statusOverlayHint', locale)}
            checked={statusOverlay}
            onChange={handleStatusOverlay}
          />

          <SelectField id='teadeck-settings-locale' label={t('language', locale)} value={uiLocale} onChange={handleLocale}>
            {availableLocales.map(code => (
              <option key={code} value={code}>{localeNames?.of(code) ?? code}</option>
            ))}
          </SelectField>

          <SelectField id='teadeck-settings-timezone' label={t('timezone', locale)} hint={t('timezoneHint', locale)} value={timezone} onChange={handleTimezone}>
            {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </SelectField>

          <h3 style={sectionHeadingStyle}>{t('appearance', locale)}</h3>

          <SelectField id='teadeck-settings-theme' label={t('theme', locale)} hint={t('themeHint', locale)} value={settings.theme} onChange={handleTheme}>
            <option value='mastodon'>{t('themeMastodon', locale)}</option>
            <option value='assam'>{t('themeAssam', locale)}</option>
            <option value='sencha'>{t('themeSencha', locale)}</option>
          </SelectField>

          <SelectField id='teadeck-settings-color-scheme' label={t('colorScheme', locale)} value={settings.colorScheme} onChange={handleColorScheme}>
            <option value='auto'>{t('colorSchemeAuto', locale)}</option>
            <option value='light'>{t('colorSchemeLight', locale)}</option>
            <option value='dark'>{t('colorSchemeDark', locale)}</option>
          </SelectField>

          <SelectField id='teadeck-settings-contrast' label={t('contrast', locale)} value={settings.contrast} onChange={handleContrast}>
            <option value='auto'>{t('contrastAuto', locale)}</option>
            <option value='high'>{t('contrastHigh', locale)}</option>
          </SelectField>

          <SelectField id='teadeck-settings-emoji-style' label={t('emojiStyle', locale)} value={settings.emojiStyle} onChange={handleEmojiStyle}>
            <option value='auto'>{t('emojiStyleAuto', locale)}</option>
            <option value='native'>{t('emojiStyleNative', locale)}</option>
            <option value='twemoji'>{t('emojiStyleTwemoji', locale)}</option>
          </SelectField>

          <SelectField id='teadeck-settings-display-media' label={t('displayMedia', locale)} value={settings.displayMedia} onChange={handleDisplayMedia}>
            <option value='default'>{t('displayMediaDefault', locale)}</option>
            <option value='show_all'>{t('displayMediaShowAll', locale)}</option>
            <option value='hide_all'>{t('displayMediaHideAll', locale)}</option>
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

          <h3 style={sectionHeadingStyle}>{t('notifications', locale)}</h3>
          <p>{t('notificationsHint', locale)}</p>

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
              <p>{t('reloadHint', locale)}</p>
              <Button onClick={reloadNow} text={t('reloadNow', locale)} />
            </div>
          )}
        </FormStack>
      </div>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export -- loaded through upstream's async route bundles
export default FrontendSettingsColumn;

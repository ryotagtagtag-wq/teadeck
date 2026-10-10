# Configuration

Copy [.env.example](../.env.example) to `.env` next to your `compose.yml`. All settings are optional. After editing them, run `docker compose up -d` and reload the page. A theme or colour scheme already chosen by a user takes precedence over deployment defaults.

| Variable | Default | Purpose |
|---|---|---|
| `TEADECK_TAG` | `latest` | Tag of the published image |
| `TEADECK_PUBLISH` | `8080` | Host port, published on all interfaces by default; use `8099` for port 8099 |
| `TEADECK_THEME` | `assam` | `assam`, `sencha` or `mastodon` |
| `TEADECK_COLOR_SCHEME` | `auto` | `auto`, `light` or `dark` |
| `TEADECK_LOGO` | unset | `flat`, `glass`, `ceramic` or `mastodon` |
| `TEADECK_LOGO_FILE` | unset | Filename of a custom SVG in `logo/`; takes precedence over `TEADECK_LOGO` |

For example:

```dotenv
TEADECK_LOGO=glass
TEADECK_THEME=sencha
TEADECK_COLOR_SCHEME=auto
```

## Themes

| Setting | Dark | Light |
|---|---|---|
| `assam` | Assam | Silver Needle |
| `sencha` | Sencha | Jasmine |
| `mastodon` | Mastodon dark | Mastodon light |

With `auto`, the colour scheme follows the operating system. The favicon follows the selected theme.

## Custom logo

Put your file at `logo/my-logo.svg` and set:

```dotenv
TEADECK_LOGO_FILE=my-logo.svg
```

Use a filename, not a path. The file must be readable by the container. If neither logo setting is supplied, no logo is shown. Missing files, unknown preset names and invalid file types are reported in the container log.

A regular SVG is shown as an image. To let its colours follow the theme, add `data-teadeck-logo` to the root `<svg>` element and use the CSS variables shown in [teacup-flat.svg](../integration/logos/teacup-flat.svg). Such files are sanitised and inserted into the page. Only use trusted logos.

The container reads these settings at startup; open pages need a reload to pick them up.

## Personal settings

Open **Settings** in the account menu (**⋯** next to your name at the bottom of the navigation) to change layout, appearance, language and notification filters for the current account. These choices stay in this browser. Some apply immediately; others offer a reload because Mastodon reads them only at startup.

## Markdown

The Markdown button is next to the emoji button at the bottom of the composer. It is highlighted when Markdown is selected; click it to switch between Markdown and plain text. Teadeck remembers an override per account. Choosing the account's default again clears that override so later changes to the server-side default can take effect.

When editing a post, Teadeck keeps the post's original format.

The button appears only if the server advertises both `text/plain` and `text/markdown`, as GoToSocial does.

## Who can reply

On GoToSocial, the composer's settings menu (the gear) has a **Who can reply** section next to **Who can quote**. Teadeck remembers the last choice per account. **Account default** sends nothing and leaves the decision to the server.

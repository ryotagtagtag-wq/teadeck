# Configuration

Copy [.env.example](../.env.example) to `.env` next to your `compose.yml`. All settings are optional. After editing them, run `docker compose up -d` and reload the page. A theme or colour scheme already chosen by a user takes precedence over deployment defaults.

| Variable | Default | Purpose |
|---|---|---|
| `TEADECK_TAG` | `latest` | Tag of the published image |
| `TEADECK_PUBLISH` | `8080` | Host port, published on all interfaces by default; use `8099` for port 8099 |
| `TEADECK_THEME` | `assam` | `assam`, `sencha`, `hibiscus` or `mastodon` |
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
| `hibiscus` | Hibiskus | Rooibos |
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

If the server accepts both `text/plain` and `text/markdown`, as GoToSocial does, the composer has a Markdown button next to the emoji button. It starts with the format set for your account on the server; a different choice is remembered per account, and choosing the account's format again clears it. Editing a post keeps its original format.

## Large composer

The right part of the **New post** button opens the large composer, with the same settings as the regular one. The button next to **Minimize** switches between both sizes without losing what you wrote. With Markdown on, a preview follows the text, with a link to a cheat sheet; your server renders the final post, so the preview is an approximation.

## Who can reply

On GoToSocial, the composer's settings menu has a **Who can reply** section: everyone, followers, accounts you follow, mutual followers or only mentioned accounts. **Account default** sends nothing and leaves the decision to the server. Choices that do not fit the post's visibility are disabled. Favourites and boosts follow your account's defaults; if Teadeck cannot load them, it does not send the post. The last choice is remembered per account.

## GoToSocial

| Mastodon feature | On GoToSocial |
| --- | --- |
| Grouped notifications | Built from the ungrouped ones |
| Custom emoji | Loaded with your sign-in |
| Profile editing | Through `update_credentials` |
| Hashtag search | Shows the tag's timeline |
| About, terms of service | Taken from the instance information |
| Collections | Not offered |

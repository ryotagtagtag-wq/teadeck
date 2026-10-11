# Teadeck

Teadeck is a standalone version of [Mastodon's web interface](https://github.com/mastodon/mastodon) for Mastodon and GoToSocial servers.

The idea is simple: use the Mastodon interface with your existing account, with a few additions for GoToSocial and a look of its own. You get single- and multi-column layouts, tea-inspired themes, a large composer for longer posts, and a Markdown button next to the emoji picker with a live preview when your server supports it. GoToSocial accounts also get a control for who can reply to a post.

Teadeck is still in active development and has no stable release yet.

![Teadeck in the multi-column layout with the Assam design: home timeline, notifications and the deployment's logo](docs/images/overview.png)

## Using Teadeck

Open a Teadeck installation, enter your server's address and sign in on your server. Choose **Stay signed in** if you want to save the account in this browser. You can add more accounts and switch between them, each with its own theme and settings.

Your browser talks directly to your Mastodon or GoToSocial server.

Unsent posts are not saved across reloads or account switches. Copy anything you want to keep first.

### What to trust

The Teadeck host supplies the JavaScript running in your browser, and that code can access your account tokens. Static hosting does not remove that risk, and the host can log visits. Use an installation you trust, or run your own on a dedicated HTTPS origin.

- OAuth uses PKCE. Authenticated API requests are restricted to the selected server, and redirects are rejected.
- Sign-in tokens stay in session storage, or also in IndexedDB when you choose **Stay signed in**. Preferences are saved in local storage. Code running on the same origin can read all of it.
- Post HTML comes from your server. Its content sanitisation and Teadeck's Content Security Policy both matter.
- The service worker caches application files, not API responses.

## Features

### Layouts and designs

Teadeck has Mastodon's single- and multi-column layouts and four designs of its own, Assam and Sencha, each with a dark and a light half. Mastodon's own design stays available. Layout, design, language and reading preferences are set per account under **Settings** in the account menu and stay in your browser.

![The four designs: Assam dark and light, Sencha dark and light](docs/images/themes.png)

### Post overlay

**Open in overlay** on a post, or a click on its time if you choose so in the settings, shows the post with its thread large in the middle of the window. Posts you open from there stay in the overlay, and replying hands the post to the composer.

![A post with its reply in the overlay](docs/images/post-overlay.png)

### Large composer

The right part of the **New post** button opens the composer as large as the post overlay, for longer posts. It has all settings of the regular composer, and the button next to **Minimize** switches between both sizes without losing what you wrote.

![The large composer with a Markdown preview](docs/images/large-composer.png)

### GoToSocial

Teadeck works with Mastodon and GoToSocial. On GoToSocial it fills in what Mastodon's interface expects and the server leaves out, and adds controls for what only GoToSocial offers.

**Markdown.** If the server accepts both plain text and Markdown, as GoToSocial does, the composer shows a Markdown button next to the emoji button. It starts with the format set for your account on the server; a different choice is remembered for later posts, and choosing the account's format again clears it. Editing a post keeps the format it was written in. The large composer shows a preview of the post below the text, with a link to a cheat sheet; the preview is an approximation, as the server renders the final post. Markdown in posts, headings, lists, quotes and code included, is shown in the colours of the design, and code blocks get line numbers, highlighting and a copy button.

**Who can reply.** GoToSocial lets a post decide who may interact with it (its interaction policy). The composer's settings menu has a **Who can reply** section next to **Who can quote**: everyone, followers, accounts you follow, mutual followers or only the accounts you mention. GoToSocial always lets mentioned accounts reply. **Account default** sends nothing and leaves it to the defaults set on your server. Choices that do not fit the post's visibility are greyed out; for example, "everyone" needs a public or unlisted post. Restricting replies only changes replies: who may favourite and boost the post is copied from your account's defaults. If these cannot be loaded, Teadeck holds the post back with a message rather than sending it with wider rules. Your last choice is remembered per account.

![The composer's settings menu with "Who can reply" on GoToSocial](docs/images/who-can-reply.png)

**Compatibility.** Notifications work without grouped notifications, custom emoji load for signed-in accounts, the profile is edited through the API GoToSocial has, hashtag searches show the tag's posts, and About and the server's terms come from what GoToSocial publishes. Features GoToSocial does not have, such as collections, are not offered.

## Deploying

### Docker Compose

The easiest way to run Teadeck is with the published container image. You need Docker and Compose.

Download [compose.yml.example](compose.yml.example) and [.env.example](.env.example) into the same directory, then run:

```sh
cp compose.yml.example compose.yml
cp .env.example .env
mkdir -p logo
docker compose pull
docker compose up -d
```

The container serves Teadeck on port **8080**, published on all host interfaces by default. Open `http://localhost:8080` on the Docker host to try it. For public access, put an HTTPS reverse proxy such as Caddy or nginx in front of it.

Use `.env` to choose a different port, logo or default theme. See [Configuration](docs/configuration.md) for the options and [Deployment](docs/deployment.md) for updates and rollbacks.

### Without Docker

Build Teadeck as described below, then serve the contents of `dist/` with a web server. Use [container/nginx.conf](container/nginx.conf) as a reference for routing, caching and security headers, adjusting the container-specific paths for your setup. Requests to app routes must fall back to `index.html`.

With either method, serve Teadeck at the root of a domain, not under a path such as `/teadeck`. Your Mastodon or GoToSocial server must use HTTPS.

## Building

The build fetches the Mastodon commit pinned in [upstream.lock.json](upstream.lock.json), applies the changes in [patches/](patches/) on top and adds the integration code in [integration/](integration/).

You need a full checkout, **Node.js 24.2 or newer**, npm, Corepack, Git and GNU tar. The first build downloads Mastodon and its dependencies, so allow several GB of disk space.

From the repository directory, run:

```sh
npm run doctor
npm run build:fresh
```

The finished web app is in `dist/`. To package your build in a container and run it:

```sh
mkdir -p logo
docker compose -f compose.yml.example -f compose.build.yml up -d --build
```

For development and tests, see [Contributing](CONTRIBUTING.md).

## License

Teadeck is licensed under [AGPL-3.0-or-later](LICENSE), as is Mastodon. See [NOTICE](NOTICE) for attribution and [integration/fonts](integration/fonts/) for font licenses. Each build includes its source code and build instructions at `/source.tar.gz`.

# Deployment

## Requirements

- Docker with Compose.
- A domain with HTTPS for public access. Teadeck runs at `/`, not in a subdirectory.
- A Mastodon or GoToSocial server with HTTPS.

## Start

Download [compose.yml.example](../compose.yml.example) and [.env.example](../.env.example) into a directory of your choice.

```sh
cp compose.yml.example compose.yml
cp .env.example .env
mkdir -p logo
docker compose pull
docker compose up -d
docker compose ps
```

Check `http://localhost:8080` from the Docker host. When upgrading, compare your `compose.yml` and `.env` with the templates.

By default port `8080` is published on all host interfaces. Set `TEADECK_PUBLISH` in `.env` to use a different host port, such as `8099`.

## Reverse proxy

Terminate HTTPS at the proxy and forward requests to the container's port 8080. Keep the response security headers supplied by nginx. Avoid logging OAuth callback query strings: they contain a one-time code and state value.

## Update

For the default `latest` image:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

If you set `TEADECK_TAG`, change it to the desired tag first.

The image is published as `git.knubbel.me/teadeck/teadeck`. Installations set up with the earlier `git.knubbel.me/knubbel/teadeck` change the `image:` line in their `compose.yml` once, as in [compose.yml.example](../compose.yml.example).

Open tabs show a notice and switch to the new version when reloaded. Copy any unsent post first.

## Choose a version or roll back

Set `TEADECK_TAG` in `.env` to an existing commit tag from the registry, then run the update commands above. Tags use the form `sha-` followed by the first 12 characters of the commit ID. `latest` always points to the newest tested build.

## Build your own image

Build Teadeck as described in [CONTRIBUTING.md](../CONTRIBUTING.md), then:

```sh
mkdir -p logo
docker compose -f compose.yml.example -f compose.build.yml up -d --build
```

To keep your own settings, use your `compose.yml` instead of `compose.yml.example`.

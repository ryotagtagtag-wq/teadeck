# Deployment

## Requirements

- Docker with Compose.
- A domain with HTTPS for public access. Teadeck runs at `/`, not in a subdirectory.
- A Mastodon or GoToSocial server with HTTPS.

The running container needs no database, Redis, Node or API proxy.

## Start

Download [compose.yml.example](../compose.yml.example) and [.env.example](../.env.example) into a directory of your choice. A full source checkout is not needed to use the published image.

```sh
cp compose.yml.example compose.yml
cp .env.example .env
mkdir -p logo
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Check `http://localhost:8080` from the Docker host. The container's `/healthz` endpoint reports whether nginx is responding; it does not check sign-in or your server's API.

Your `compose.yml` and `.env` are local copies. Git ignores them, so pulling source updates will not overwrite your deployment settings. Compare them with the templates when upgrading.

By default port `8080` is published on all host interfaces. Set `TEADECK_PUBLISH` in `.env` to use a different host port, such as `8099`.

## Reverse proxy

Terminate HTTPS at the proxy and forward requests to the container's port 8080. Keep the response security headers supplied by nginx. WebSocket forwarding to Teadeck is not needed: the browser connects directly to your server's streaming endpoint.

If the proxy runs in another container, its `127.0.0.1` is not the Docker host. Use a shared network or a reachable host address. Avoid logging OAuth callback query strings: they contain a one-time code and state value.

## Update

For the default `latest` image:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

If you set `TEADECK_TAG`, change it to the desired tag first.

Open tabs offer a reload after downloading an update. A waiting update is also applied when the page next starts. This requires a successful download; a new container alone does not immediately update every browser. Copy any unsent post before reloading.

## Choose a version or roll back

Set `TEADECK_TAG` in `.env` to an existing commit tag from the registry, then run the update commands above. Tags use the form `sha-` followed by the first 12 characters of the commit ID. `latest` always points to the newest tested build.

Rolling back the image does not roll back local browser data. Check sign-in and existing tabs after switching versions, especially across data migrations.

## Build your own image

Use a full checkout and follow [the build instructions](../CONTRIBUTING.md). The Dockerfile only packages an existing build; it needs both `dist/` and `.work/image/`.

After building and testing:

```sh
mkdir -p logo
docker compose -f compose.yml.example -f compose.build.yml up -d --build
```

This uses the template settings and creates `teadeck:local`. To retain a customised deployment configuration, replace `compose.yml.example` with your local `compose.yml` in the command.

# Teadeck: a static web client, served by nginx.
# The client is built with Node beforehand (npm run build); this file only packages
# dist/ and the logos. What is shipped is therefore exactly what was tested - the
# image is never a second, independent build of the same sources.
# (No BuildKit-only syntax: CI builds this file with Kaniko.)

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

LABEL org.opencontainers.image.title="Teadeck" \
      org.opencontainers.image.description="Browser-based Mastodon/GoToSocial client, static files served by nginx" \
      org.opencontainers.image.source="https://git.knubbel.me/knubbel/teadeck" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

# nginx from Alpine's package repository.
RUN apk add --no-cache nginx

COPY container/nginx.conf /etc/nginx/nginx.conf
COPY container/entrypoint.sh /entrypoint.sh
COPY dist /usr/share/nginx/html

# Logos to choose from with TEADECK_LOGO: Teadeck's teacup in three materials, and
# Mastodon's own logo for `default`. The build collects them (scripts/build.mjs).
COPY .work/image/logos /usr/share/teadeck/logos
COPY .work/image/logo-default.svg /usr/share/teadeck/logo-default.svg

# Runs as Alpine's unprivileged nginx user; logs go to stdout/stderr, temp files
# to /tmp (the logo and the deployment's design are written there at startup).
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

# Puts the configured logo in place (TEADECK_LOGO), then starts nginx.
ENTRYPOINT ["/entrypoint.sh"]

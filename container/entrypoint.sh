#!/bin/sh
# Puts the configured logo where nginx serves it as /logo.svg, writes the
# deployment defaults to /teadeck.json, then starts nginx. Settings: see
# docs/configuration.md. A broken logo is reported and left out; it never keeps
# Teadeck from starting.
set -e

# Overridable for tests; in the image these are the real locations.
logo_dir=${TEADECK_LOGO_DIR:-/config}
bundled_dir=${TEADECK_LOGO_BUNDLED:-/usr/share/teadeck/logos}
default_logo=${TEADECK_LOGO_DEFAULT:-/usr/share/teadeck/logo-default.svg}
target=${TEADECK_LOGO_TARGET:-/tmp/logo}
config_target=${TEADECK_CONFIG_TARGET:-/tmp/config}
# Teadeck's designs, one per line (written by scripts/build.mjs from integration/themes/).
designs_file=${TEADECK_DESIGNS:-/usr/share/teadeck/designs}

warn() {
  echo "Teadeck: $1 Starting without a logo." >&2
}

note() {
  echo "Teadeck: $1" >&2
}

own_file() {
  name=$(basename "$TEADECK_LOGO_FILE")
  if [ "$name" != "$TEADECK_LOGO_FILE" ]; then
    note "TEADECK_LOGO_FILE=$TEADECK_LOGO_FILE is a path; only the logo directory is served, so looking for $name there."
  fi
  echo "$logo_dir/$name"
}

bundled_logo() {
  case "$TEADECK_LOGO" in
    flat | glass | ceramic) echo "$bundled_dir/teacup-$TEADECK_LOGO.svg" ;;
    mastodon | default) echo "$default_logo" ;;
    *) return 1 ;;
  esac
}

install_logo() {
  if [ -n "${TEADECK_LOGO_FILE:-}" ]; then
    if [ -n "${TEADECK_LOGO:-}" ]; then
      note "TEADECK_LOGO and TEADECK_LOGO_FILE are both set; using the file $TEADECK_LOGO_FILE."
    fi
    source=$(own_file)
  elif [ -n "${TEADECK_LOGO:-}" ]; then
    if ! source=$(bundled_logo); then
      warn "TEADECK_LOGO=$TEADECK_LOGO is not one of flat, glass, ceramic, mastodon; own files belong in TEADECK_LOGO_FILE."
      return 0
    fi
  else
    # Nothing configured: no logo, and that is not an error.
    return 0
  fi

  if [ ! -f "$source" ]; then
    warn "$source does not exist (own files belong in ./logo next to compose.yml)."
    return 0
  fi
  case "$(head -c 1000 "$source")" in
    *'<svg'*) ;;
    *) warn "$source is not an SVG file."; return 0 ;;
  esac
  cp "$source" "$target/logo.svg"
}

# The design this deployment starts with; anything unknown is reported and left out,
# so a typo costs the default, never the start.
write_config() {
  theme=${TEADECK_THEME:-}
  scheme=${TEADECK_COLOR_SCHEME:-}
  if [ -n "$theme" ] && [ "$theme" != mastodon ] && ! grep -qxF "$theme" "$designs_file" 2>/dev/null; then
    known=$( (tr '\n' ' ' < "$designs_file") 2>/dev/null || true)
    note "TEADECK_THEME=$theme is not mastodon or one of: ${known% }; using the default design."
    theme=''
  fi
  case "$scheme" in
    '' | auto | light | dark) ;;
    *) note "TEADECK_COLOR_SCHEME=$scheme is not auto, light or dark; using the default."; scheme='' ;;
  esac
  [ -z "$theme" ] && [ -z "$scheme" ] && return 0

  separator=''
  {
    printf '{'
    if [ -n "$theme" ]; then printf '"theme":"%s"' "$theme"; separator=','; fi
    if [ -n "$scheme" ]; then printf '%s"colorScheme":"%s"' "$separator" "$scheme"; fi
    printf '}\n'
  } > "$config_target/teadeck.json"
}

rm -rf "$target" "$config_target"
mkdir -p "$target" "$config_target"
install_logo
write_config

# -e stderr: log startup errors to stderr instead of the (read-only) default log file.
exec nginx -e stderr -g 'daemon off;' "$@"

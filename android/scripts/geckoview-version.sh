#!/usr/bin/env bash
set -euo pipefail

META="$(curl -fsSL https://repo1.maven.org/maven2/org/mozilla/geckoview/geckoview/maven-metadata.xml)"
VERSION="$(printf '%s' "$META" | grep -o '<version>[^<]*</version>' | tail -n 1 | sed 's/<[^>]*>//g')"
echo "$VERSION"

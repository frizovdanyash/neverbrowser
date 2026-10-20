#!/usr/bin/env bash
set -euo pipefail

for REPO in https://maven.mozilla.org/maven2 https://repo1.maven.org/maven2; do
  if META="$(curl -fsSL --max-time 20 "$REPO/org/mozilla/geckoview/geckoview/maven-metadata.xml" 2>/dev/null)"; then
    for MAJOR in 131 132 133 134; do
      VERSION="$(printf '%s' "$META" | grep -o '<version>[^<]*</version>' | sed 's/<[^>]*>//g' | grep -E "^${MAJOR}\." | tail -n 1)"
      if [ -n "$VERSION" ]; then
        echo "$VERSION"
        exit 0
      fi
    done
  fi
done
echo "131.0.20240913135429"

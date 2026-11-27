#!/usr/bin/env bash
# Starts the dev server (port 5199, or PORT=5173) against the LOCAL Supabase stack (never the live project).
# The invite function only accepts the origins http://localhost:5173 and the live site, so the invite checks use PORT=5173.
# Needs `npx supabase start` to be running. The keys are read from the local stack at run time.
set -euo pipefail
cd "$(dirname "$0")/../.."
KEY=$(npx supabase status -o env 2>/dev/null | sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p')
URL=$(npx supabase status -o env 2>/dev/null | sed -n 's/^API_URL="\(.*\)"$/\1/p')
[ -n "$KEY" ] && [ -n "$URL" ] || { echo "The local stack is not running."; exit 1; }
VITE_SUPABASE_URL="$URL" VITE_SUPABASE_ANON_KEY="$KEY" exec npx vite --port "${PORT:-5199}" --strictPort

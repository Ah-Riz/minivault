#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/app/lib"
cp "$ROOT/target/idl/mini_vault.json" "$ROOT/app/lib/idl.json"
cp "$ROOT/target/types/mini_vault.ts" "$ROOT/app/lib/mini_vault.ts"
echo "Synced IDL + types → app/lib/"

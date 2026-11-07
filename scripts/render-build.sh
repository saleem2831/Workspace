#!/usr/bin/env bash
set -euo pipefail
npm --prefix backend install --include=dev --no-audit --no-fund
npm --prefix backend run build
npm --prefix frontend install --include=dev --no-audit --no-fund
npm --prefix frontend run build

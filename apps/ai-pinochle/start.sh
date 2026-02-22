#!/usr/bin/env bash
set -e

trap 'kill 0' EXIT

echo "Starting backend server..."
(cd server && uvicorn app.main:app --reload) &

echo "Starting web client..."
(cd web && npm run dev) &

wait

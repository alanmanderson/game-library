#!/bin/bash
# Local development startup script for Bughouse Chess server.
# NOT used by Docker — the Dockerfile has its own CMD/entrypoint.
# Serves both API and frontend from port 8000.

cd "$(dirname "$0")/backend"

if [[ "$(uname)" == "Darwin" ]]; then
    # macOS: use the venv python directly (assumes `uv sync` or equivalent was run)
    exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
else
    # Linux: add uv to PATH if installed in the standard location
    export PATH="$HOME/.local/bin:$(uv python dir 2>/dev/null || true):$PATH"
    exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
fi

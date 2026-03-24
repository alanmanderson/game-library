#!/bin/bash
# Start the Bughouse Chess server
# Serves both API and frontend from port 8000

cd "$(dirname "$0")/backend"

if [[ "$(uname)" == "Darwin" ]]; then
    # macOS: use the venv python directly (assumes `uv sync` or equivalent was run)
    exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
else
    # Docker/Linux: add uv-managed Python to PATH
    export PATH="/home/claude/.local/bin:/home/claude/.local/share/uv/python/cpython-3.12.13-linux-aarch64-gnu/bin:$PATH"
    exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
fi

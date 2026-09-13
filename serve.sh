#!/bin/sh
# Serve the game locally (HTTP required; file:// will not work).
PORT="${1:-8082}"
python3 -m http.server "$PORT" --bind 0.0.0.0

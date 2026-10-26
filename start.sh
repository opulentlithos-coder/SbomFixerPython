#!/bin/sh
cd "$(dirname "$0")"
PY=python3
command -v python3.14 >/dev/null 2>&1 && PY=python3.14
$PY -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 14) else 1)" || {
  echo "This package needs exactly Python 3.14 (it was built for that version)."; exit 1; }
exec $PY app.pyc "$@"

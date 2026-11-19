#!/bin/bash
# Runs the API (uvicorn, localhost only) and nginx (the only exposed port) in one container.
# If either process exits, stop the other and exit, so Docker's restart policy kicks in.
set -uo pipefail

python -m localtube --host 127.0.0.1 --port 8000 --no-access-log &
nginx -e stderr -g 'daemon off;' &

stop() {
  kill -TERM $(jobs -p) 2>/dev/null
}
trap stop TERM INT

wait -n
status=$?
stop
wait
exit "$status"

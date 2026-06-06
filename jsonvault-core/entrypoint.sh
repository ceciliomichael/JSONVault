#!/bin/sh
set -e

# Ensure the data directory exists
mkdir -p /app/data

# Fix permissions for the mounted volume.
# This ensures that if the host mounted a folder with restrictive permissions,
# the appuser will still be able to write to it.
chown -R appuser:appgroup /app/data

# Drop root privileges and execute the main application as 'appuser'
# using su-exec to properly replace the current process (PID 1 forwarding)
exec su-exec appuser "$@"

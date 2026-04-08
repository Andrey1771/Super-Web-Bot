#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
docker compose -f docker-compose.keycloak-debug.yml up -d

echo "Keycloak debug is starting..."
echo "- URL: http://localhost:8088"
echo "- Admin console bootstrap user: kcadmin / kcadmin"
echo "- Debug realm users: admin/admin and user/user"

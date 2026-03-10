#!/bin/bash
# acme_renew.sh - Auto-renew SSL certificate and deploy to CDN
# Uses ECS instance role STS Token, no AccessKey needed

ROLE_NAME="hotnews-oss-backup-role"

# Fetch STS credentials from ECS metadata service
CRED=$(curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/$ROLE_NAME)
export Ali_Key=$(echo $CRED | python3 -c "import sys,json;print(json.load(sys.stdin)['AccessKeyId'])")
export Ali_Secret=$(echo $CRED | python3 -c "import sys,json;print(json.load(sys.stdin)['AccessKeySecret'])")
export Ali_Security_Token=$(echo $CRED | python3 -c "import sys,json;print(json.load(sys.stdin)['SecurityToken'])")

# Run acme.sh renewal
/root/.acme.sh/acme.sh --cron --home /root/.acme.sh

# If renewal happened (check if cert was updated in last 24h), deploy to CDN
CERT_FILE="/root/.acme.sh/hot.uihash.com_ecc/fullchain.cer"
if [ -f "$CERT_FILE" ] && [ $(find "$CERT_FILE" -mmin -1440 2>/dev/null | wc -l) -gt 0 ]; then
    echo "[$(date)] Certificate renewed, deploying to CDN..."
    python3 /root/.acme.sh/deploy_cdn_cert.py
fi

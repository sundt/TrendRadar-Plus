#!/usr/bin/env python3
"""Deploy SSL certificate to Alibaba Cloud CDN using ECS instance role STS Token"""
import json, hashlib, hmac, base64, urllib.request, urllib.parse, time, uuid, sys

DOMAIN = "hot.uihash.com"
CDN_ENDPOINT = "https://cdn.aliyuncs.com/"
CERT_DIR = "/root/.acme.sh/hot.uihash.com_ecc"

def get_sts_credentials():
    meta_url = "http://100.100.100.200/latest/meta-data/ram/security-credentials/"
    role = urllib.request.urlopen(meta_url).read().decode().strip()
    cred = json.loads(urllib.request.urlopen(meta_url + role).read())
    return cred["AccessKeyId"], cred["AccessKeySecret"], cred["SecurityToken"]

def sign(params, access_secret, method="GET"):
    sorted_params = sorted(params.items())
    query = urllib.parse.urlencode(sorted_params, quote_via=urllib.parse.quote)
    string_to_sign = f"{method}&{urllib.parse.quote('/', safe='')}&{urllib.parse.quote(query, safe='')}"
    h = hmac.new((access_secret + "&").encode(), string_to_sign.encode(), hashlib.sha1)
    return base64.b64encode(h.digest()).decode()

def deploy_cert():
    access_key, access_secret, security_token = get_sts_credentials()

    with open(f"{CERT_DIR}/fullchain.cer") as f:
        cert_content = f.read()
    with open(f"{CERT_DIR}/{DOMAIN}.key") as f:
        key_content = f.read()

    params = {
        "Action": "SetCdnDomainSSLCertificate",
        "DomainName": DOMAIN,
        "SSLProtocol": "on",
        "CertType": "upload",
        "CertName": f"{DOMAIN}-le-{time.strftime('%Y%m%d')}",
        "SSLPub": cert_content,
        "SSLPri": key_content,
        "AccessKeyId": access_key,
        "SecurityToken": security_token,
        "Format": "JSON",
        "Version": "2018-05-10",
        "SignatureMethod": "HMAC-SHA1",
        "SignatureVersion": "1.0",
        "SignatureNonce": str(uuid.uuid4()),
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    params["Signature"] = sign(params, access_secret)
    url = CDN_ENDPOINT + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)

    try:
        resp = urllib.request.urlopen(url)
        result = json.loads(resp.read())
        print(f"✅ Certificate deployed successfully! RequestId: {result.get('RequestId')}")
        return True
    except urllib.error.HTTPError as e:
        error = e.read().decode()
        print(f"❌ Deploy failed: {error}", file=sys.stderr)
        return False

if __name__ == "__main__":
    sys.exit(0 if deploy_cert() else 1)

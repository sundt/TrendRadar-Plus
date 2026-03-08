import asyncio
from hotnews.web.submit_api import _validate_url, _discover_rss, _check_server_reachability

async def test():
    url = "https://www.cnblogs.com/"
    print("Validating URL...")
    ok, reason = _validate_url(url)
    print(f"Validate: ok={ok}, reason={reason}")
    if not ok:
        return
    
    print("Discovering RSS...")
    res = None
    try:
        res = _discover_rss(url)
        print("Without proxy:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

    if res:
        print("Testing server reachability...")
        feed_url = res.get('feed_url')
        try:
            reachable = await _check_server_reachability(feed_url)
            print(f"Reachable: {reachable}")
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())

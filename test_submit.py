import asyncio
import json
from hotnews.web.submit_api import handle_submit_url, SubmitRequest
from fastapi import Request

async def main():
    try:
        req = SubmitRequest(url="https://www.cnblogs.com/")
        class MockClient:
            host = "127.0.0.1"
        class MockRequest:
            client = MockClient()
            headers = {"x-real-ip": "127.0.0.1"}
        
        request = MockRequest()
        resp = await handle_submit_url(req, request)
        print("Response:", resp.body.decode('utf-8'))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

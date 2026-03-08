import asyncio
import os
from hotnews.web.submit_api import submit_url, SubmitRequest

async def main():
    try:
        class MockClient:
            host = "127.0.0.1"
        class MockRequest:
            client = MockClient()
            headers = {"x-real-ip": "127.0.0.1"}
        
        req = SubmitRequest(url="https://www.cnblogs.com")
        request = MockRequest()
        
        os.environ["HOTNEWS_DATA_DIR"] = "/app/data"
        resp = await submit_url(req, request)
        if hasattr(resp, "body"):
            print("Success:", resp.body.decode('utf-8'))
        else:
            print("Success:", resp)
    except Exception as e:
        print("ERROR IN HANDLE:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

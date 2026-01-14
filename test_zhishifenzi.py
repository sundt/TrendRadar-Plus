
import requests
import xml.etree.ElementTree as etree
import re
import datetime
import traceback

# Mock Context
class Context:
    pass

config = {}
context = Context()

# Read the scraper script
with open("hotnews/utils/scrapers/zhishifenzi_scraper.py", "r") as f:
    script_content = f.read()

# Prepare globals matching DynamicPyProvider
safe_globals = {
    "requests": requests,
    "etree": etree,
    "re": re,
    "datetime": datetime,
    "__builtins__": __builtins__
}

try:
    print("Executing script...")
    exec(script_content, safe_globals)
    
    fetch_func = safe_globals.get("fetch")
    if not fetch_func:
        print("Error: fetch function not found")
        exit(1)
        
    print("Calling fetch()...")
    results = fetch_func(config, context)
    
    print(f"Got {len(results)} results")
    for i, res in enumerate(results[:3]):
        print(f"Result #{i}:")
        print(f"  Title: {res.get('title')}")
        print(f"  URL: {res.get('url')}")
        print(f"  Published: {res.get('published_at')} (TS)")
        try:
            print(f"  Date: {datetime.datetime.fromtimestamp(res.get('published_at'))}")
        except:
            pass
            
    if len(results) > 0:
        print("SUCCESS")
    else:
        print("FAILURE: No results found")

except Exception as e:
    traceback.print_exc()

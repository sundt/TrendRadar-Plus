import requests
from bs4 import BeautifulSoup
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = "https://zhishifenzi.blog.caixin.com/"
try:
    resp = requests.get(url, headers=headers, timeout=10)
    resp.encoding = 'utf-8' 
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    print("\n--- Detailed Structure Analysis ---")
    
    # Based on previous find, look for div.new-con
    containers = soup.select('div.new-con')
    print(f"Found {len(containers)} 'div.new-con' containers")
    
    for i, con in enumerate(containers[:3]): # Check first few
        print(f"\nContainer #{i}:")
        # Print first 200 chars of text to see if date is there
        print(f"  Text content: {con.get_text(separator='|', strip=True)[:100]}...")
        
        # Look for links inside
        links = con.find_all('a', href=True)
        for link in links:
             print(f"  Link: {link.get_text(strip=True)} -> {link['href']}")
             
             # Check siblings for date
             # Usually date is a span or just text
             # Let's check parent's siblings?
             parent = link.parent
             print(f"  Parent siblings: {[s.name for s in parent.next_siblings if s.name]}")
             print(f"  Parent text: {parent.get_text(strip=True)}")

    # Check for specific date patterns in the whole soup if finding is hard
    dates = soup.find_all(string=re.compile(r"202\d-\d{2}-\d{2}|202\d年\d+月\d+日"))
    print(f"\nFound {len(dates)} date-like strings:")
    for d in dates[:5]:
        print(f"  Date: {d.strip()} (Parent: {d.parent.name})")

except Exception as e:
    print(f"Error: {e}")

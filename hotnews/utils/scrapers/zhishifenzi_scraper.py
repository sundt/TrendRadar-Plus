
def fetch(config, context):
    """
    Fetches articles from https://zhishifenzi.blog.caixin.com/ using its RSS feed.
    """
    url = "https://zhishifenzi.blog.caixin.com/feed"
    
    # Use context['use_scraperapi'] if you want, but usually RSS is open.
    # We use requests from the allowed environment.
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        content = resp.content
    except Exception as e:
        # If direct access fails, maybe try with User-Agent
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        content = resp.content

    # Parse XML
    # etree is available as 'etree' in globals
    root = etree.fromstring(content)
    
    # RSS 2.0 usually has channel -> item
    channel = root.find("channel")
    if channel is None:
        # Fallback if channel is missing (mostly unlikely for RSS 2.0)
        items = root.findall("item")
    else:
        items = channel.findall("item")

    results = []
    
    # Helper to parse RSS date (RFC 822)
    # Example: Sun, 4 Jan 2026 02:48:29 GMT
    def parse_date(date_str):
        try:
            # Simple mapping for months
            months = {
                'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
            }
            # Regex to extract parts
            # matches: DayName, Day Month Year Hour:Min:Sec Zone
            m = re.search(r"(\d+)\s+([A-Za-z]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})", date_str)
            if m:
                day, mon_str, year, hh, mm, ss = m.groups()
                mon = months.get(mon_str, 1)
                dt = datetime.datetime(int(year), int(mon), int(day), int(hh), int(mm), int(ss))
                return int(dt.timestamp())
        except Exception:
            pass
        return 0

    for item in items:
        # Extract fields
        title = item.find("title")
        link = item.find("link")
        pub_date = item.find("pubDate")
        description = item.find("description")

        title_text = title.text if title is not None else ""
        link_text = link.text if link is not None else ""
        
        # Clean up CDATA if present (etree handles it but sometimes text can be messy)
        title_text = title_text.strip()
        link_text = link_text.strip()
        
        # Skip if no link
        if not link_text:
            continue
            
        published_at = 0
        if pub_date is not None:
             published_at = parse_date(pub_date.text)

        # Content snippet
        desc_text = description.text if description is not None else ""

        results.append({
            "title": title_text,
            "url": link_text,
            "published_at": published_at,
            "content": desc_text[:200]  # Store a snippet
        })
        
    return results

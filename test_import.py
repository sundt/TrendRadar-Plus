try:
    mod = __import__("xml.etree.ElementTree")
    print(f"Imported: {mod}")
    print(f"Has fromstring? {hasattr(mod, 'fromstring')}")
    
    # How to get ElementTree?
    if hasattr(mod, 'etree'):
        print(f"Has etree? {mod.etree}")
        if hasattr(mod.etree, 'ElementTree'):
             print(f"Has ElementTree? {mod.etree.ElementTree}")
             print(f"  Has fromstring? {hasattr(mod.etree.ElementTree, 'fromstring')}")

    # Correct way usually
    mod2 = __import__("xml.etree.ElementTree", fromlist=["ElementTree"])
    print(f"\nImport with fromlist: {mod2}")
    print(f"Has fromstring? {hasattr(mod2, 'fromstring')}")

except Exception as e:
    print(e)

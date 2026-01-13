
import os
from PIL import Image
import sys

IMAGE_DIR = "hotnews/web/static/images"
TARGET_EXTENSIONS = {".jpg", ".jpeg", ".png"}

def convert_images():
    if not os.path.exists(IMAGE_DIR):
        print(f"Directory {IMAGE_DIR} not found.")
        return

    saved_bytes = 0
    
    for filename in os.listdir(IMAGE_DIR):
        base, ext = os.path.splitext(filename)
        if ext.lower() in TARGET_EXTENSIONS:
            filepath = os.path.join(IMAGE_DIR, filename)
            target_path = os.path.join(IMAGE_DIR, base + ".webp")
            
            try:
                with Image.open(filepath) as img:
                    # Convert to RGB if RGBA (for jpg compatibility, though WebP supports alpha)
                    # WebP supports RGBA, so we usually don't need to convert, but good to be safe for some modes
                    img.save(target_path, "WEBP", quality=80)
                    
                original_size = os.path.getsize(filepath)
                new_size = os.path.getsize(target_path)
                saved = original_size - new_size
                saved_bytes += saved
                
                print(f"Converted {filename} ({original_size/1024:.1f}KB) -> {base}.webp ({new_size/1024:.1f}KB)")
                
                # Verify usage before deleting (skipping deletion as grep found no refs, keeping for safety)
                # os.remove(filepath) 
                
            except Exception as e:
                print(f"Failed to convert {filename}: {e}")

    print(f"Total space saved: {saved_bytes / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    convert_images()

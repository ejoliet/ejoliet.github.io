# Picture Inventory

Mobile-first static object-inventory tool at:

- `/picture-inventory/index.html`

It accepts a shared photo/screenshot, runs object detection in the browser, and shows:

- a numbered bounding-box overlay
- grouped inventory rows by category
- per-object overlay number, name, quantity, confidence, position, and short description
- summary counts by total objects and category
- confidence threshold filtering
- overlap deduplication for repeated detections of the same object

## iOS Shortcut import

1. Download `/home/runner/work/ejoliet.github.io/ejoliet.github.io/picture-inventory/Picture-Inventory.shortcut`, then copy it to iCloud Drive.
2. On iOS, open Files, tap the `.shortcut` file, then import into Shortcuts.
3. In Shortcuts, edit the **Replace Text** action and change:
   - `https://YOUR_HOST/picture-inventory/index.html#image=`
   - to your deployed host (for example `https://ejoliet.github.io/picture-inventory/index.html#image=`).
4. Enable this shortcut in the share sheet.

When you share one photo/screenshot to the shortcut, it resizes to max 1024 px, converts to JPEG ~70%, base64-encodes it, and opens the web app with `#image=...`.

## Detection notes

- Detection uses the browser-loaded COCO-SSD model from CDN scripts.
- Categories are derived from the detected label and grouped in the UI.
- The confidence slider filters what is shown without changing the stored image.
- If model scripts cannot load, the image is still stored but analysis will need a browser session with network access to the CDN.

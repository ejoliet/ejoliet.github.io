# Picture Inventory

Mobile-first static photo inventory at:

- `/picture-inventory/index.html`

## iOS Shortcut import

1. Copy `/picture-inventory/Picture-Inventory.shortcut` to iCloud Drive.
2. On iOS, open Files, tap the `.shortcut` file, then import into Shortcuts.
3. In Shortcuts, edit the **Replace Text** action and change:
   - `https://YOUR_HOST/picture-inventory/index.html#image=`
   - to your deployed host (for example `https://ejoliet.github.io/picture-inventory/index.html#image=`).
4. Enable this shortcut in the share sheet.

When you share one photo/screenshot to the shortcut, it resizes to max 1024 px, converts to JPEG ~70%, base64-encodes it, and opens the web app with `#image=...`.

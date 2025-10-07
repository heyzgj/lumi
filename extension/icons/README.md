# LUMI Icons

This directory should contain the extension icons in PNG format:

- `icon-16.png` - 16x16px (toolbar)
- `icon-48.png` - 48x48px (extension management)
- `icon-128.png` - 128x128px (Chrome Web Store)

## Quick Icon Generation

### Option 1: Use Online Tool

1. Visit [Favicon Generator](https://realfavicongenerator.net/)
2. Upload a logo or use emoji ✨
3. Download the generated icons
4. Rename and place them here

### Option 2: Use ImageMagick

```bash
# Create a simple colored icon
convert -size 128x128 xc:none -fill "#667eea" -draw "circle 64,64 64,10" \
        -fill white -font Arial-Bold -pointsize 60 -gravity center \
        -annotate +0+0 "✨" icon-128.png

convert icon-128.png -resize 48x48 icon-48.png
convert icon-128.png -resize 16x16 icon-16.png
```

### Option 3: Use Emoji

```bash
# macOS: Screenshot emoji in large size, crop and resize
# 1. Open "Character Viewer" (Cmd+Ctrl+Space)
# 2. Find ✨ emoji, zoom to large size
# 3. Screenshot and save
# 4. Crop and resize using Preview or online tools
```

## Temporary Workaround

If you don't have icons yet, you can remove the `icons` field from `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "LUMI",
  ...
  // Remove or comment out:
  // "icons": {
  //   "16": "icons/icon-16.png",
  //   "48": "icons/icon-48.png",
  //   "128": "icons/icon-128.png"
  // }
}
```

Chrome will use a default icon until you add custom ones.


# Changelog

## 0.1.0

- Detect Orca from `ORCA_IMAGE_PROTOCOL` and enable Pi's inline images.
- Draw Kitty images in full inside Orca (draw-images-last render path).
- Restore images lost while a tab was hidden, on focus-in.
- `/orca-images status|test|redraw`.
- `PI_ORCA_IMAGES=0` opt-out; explicit `PI_IMAGE_PROTOCOL` always wins.

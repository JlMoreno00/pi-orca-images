# Changelog

## 0.2.2

- Gallery: preview image (`pi.image`) and shorter description for the pi.dev package page.
- README: absolute links so images render on pi.dev.

## 0.2.1

- README: banner, before/after screenshot and a demo GIF of the `[Image N]` labels.

## 0.2.0

- Show pasted image paths as bold, colored `[Image N]` labels in the prompt; they expand back to the path on send. `PI_IMAGE_LABELS=0` turns them off.
- `/orca-images status` reports whether image labels are on.
- Fix: images in a session opened with `/resume`, `/new` or `/fork` showed only their first row; they are now redrawn in full.

## 0.1.0

- Detect Orca from `ORCA_IMAGE_PROTOCOL` and enable Pi's inline images.
- Draw Kitty images in full inside Orca (draw-images-last render path).
- Restore images lost while a tab was hidden, on focus-in.
- `/orca-images status|test|redraw`.
- `PI_ORCA_IMAGES=0` opt-out; explicit `PI_IMAGE_PROTOCOL` always wins.

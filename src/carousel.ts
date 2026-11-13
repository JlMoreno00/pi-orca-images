import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Image, truncateToWidth } from "@earendil-works/pi-tui";
import type { ImageEntry, ImageLabels } from "./labels.ts";
import { NO_PREVIEW_LINK } from "./preview.ts";

/** The parts of the editor's image labels the carousel reads. */
export type CarouselLabels = Pick<ImageLabels, "entries" | "cursorLabel" | "pastes" | "lastPasted">;

export interface CarouselView {
	entries: ImageEntry[];
	selected: ImageEntry;
	index: number;
}

/** Shortcut hint for the legend: macOS key symbols there, key names elsewhere. */
export const CAROUSEL_HINT = process.platform === "darwin" ? "⌃⇧←→" : "ctrl+shift ←→";
/** Thumbnail size in terminal cells: small enough to keep the prompt in view. */
const THUMBNAIL = { maxWidthCells: 24, maxHeightCells: 6 } as const;

/**
 * Which pasted image the preview shows. The latest event wins: a paste shows the new image,
 * the cursor moving onto a label shows that label, and a shortcut step shows the next one.
 */
export class Carousel {
	#selected: number | undefined;
	#lastCursor: number | undefined;
	#lastPastes = 0;
	#entries: ImageEntry[] = [];

	resolve(labels: CarouselLabels | undefined): CarouselView | undefined {
		const entries = labels?.entries() ?? [];
		this.#entries = entries;
		if (!labels || entries.length === 0) {
			this.#selected = undefined;
			return undefined;
		}
		if (labels.pastes !== this.#lastPastes) {
			this.#lastPastes = labels.pastes;
			this.#selected = labels.lastPasted;
		}
		const cursor = labels.cursorLabel();
		if (cursor !== this.#lastCursor) {
			this.#lastCursor = cursor;
			if (cursor !== undefined) this.#selected = cursor;
		}
		let index = entries.findIndex((entry) => entry.id === this.#selected);
		if (index === -1) index = entries.length - 1;
		const selected = entries[index] ?? entries[0];
		if (!selected) return undefined;
		this.#selected = selected.id;
		return { entries, selected, index };
	}

	/** Show the next (1) or previous (-1) image, wrapping around. */
	step(delta: 1 | -1): void {
		const count = this.#entries.length;
		if (count === 0) return;
		const current = Math.max(0, this.#entries.findIndex((entry) => entry.id === this.#selected));
		this.#selected = this.#entries[(current + delta + count) % count]?.id;
	}
}

export interface LoadedImage {
	data: string;
	mimeType: string;
}

const MIME_TYPES: Record<string, string> = {
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
	bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
	avif: "image/avif",
};

export function loadImageFile(path: string): LoadedImage | undefined {
	const mimeType = MIME_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
	if (!mimeType) return undefined;
	try {
		return { data: readFileSync(path).toString("base64"), mimeType };
	} catch {
		return undefined;
	}
}

export interface CarouselWidgetOptions {
	labels: () => CarouselLabels | undefined;
	carousel: Carousel;
	theme: { accent: (text: string) => string; muted: (text: string) => string; fallback?: (text: string) => string };
	load?: (path: string) => LoadedImage | undefined;
	hint?: string;
}

/**
 * A preview above the prompt: one thumbnail of the selected image with a compact navigator
 * legend below it, `‹ [Image 2] ›  2/3 · ⌃⇧←→`, or just `[Image 1]` for a single image.
 * Terminals without inline images get Pi's text fallback (type, size and file name).
 */
export function createCarouselWidget(options: CarouselWidgetOptions) {
	const load = options.load ?? loadImageFile;
	const { accent, muted } = options.theme;
	const hint = options.hint ?? CAROUSEL_HINT;
	const images = new Map<string, Image | null>();
	return {
		render(width: number): string[] {
			const view = options.carousel.resolve(options.labels());
			if (!view) {
				images.clear();
				return [];
			}
			// Keyed by label, not path: pasting the same path again (an overwritten screenshot) reads it anew.
			const key = (entry: ImageEntry) => `${entry.id}:${entry.path}`;
			const live = new Set(view.entries.map(key));
			for (const cached of images.keys()) if (!live.has(cached)) images.delete(cached);

			const { selected, index, entries } = view;
			const label = accent(`[Image ${selected.id}]`);
			const legend = entries.length === 1
				? label
				: `${muted("‹")} ${label} ${muted("›")}  ${muted(`${index + 1}/${entries.length} · ${hint}`)}`;
			if (!images.has(key(selected))) {
				const loaded = load(selected.path);
				const image = loaded
					? new Image(loaded.data, loaded.mimeType, { fallbackColor: options.theme.fallback ?? ((s) => s) }, {
						...THUMBNAIL,
						filename: basename(selected.path),
					})
					: null;
				// The legend below names the image; an Open image link there would crowd it.
				if (image) Object.assign(image, { [NO_PREVIEW_LINK]: true });
				images.set(key(selected), image);
			}
			const image = images.get(key(selected));
			const body = image ? image.render(width) : [truncateToWidth(muted(`Cannot read ${selected.path}`), width)];
			return [...body, truncateToWidth(legend, width)];
		},
		invalidate() {
			for (const image of images.values()) image?.invalidate();
		},
	};
}

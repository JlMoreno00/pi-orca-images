import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Carousel, createCarouselWidget, type CarouselLabels } from "../src/carousel.ts";

function fakeLabels(initial: number[] = []) {
	const state = {
		ids: [...initial],
		cursor: undefined as number | undefined,
		pastes: initial.length,
		lastPasted: initial.at(-1),
	};
	const labels: CarouselLabels = {
		entries: () => state.ids.map((id) => ({ id, path: `/tmp/${id}.png` })),
		cursorLabel: () => state.cursor,
		get pastes() {
			return state.pastes;
		},
		get lastPasted() {
			return state.lastPasted;
		},
	};
	const paste = (id: number) => {
		state.ids.push(id);
		state.pastes++;
		state.lastPasted = id;
	};
	return { labels, state, paste };
}

const shown = (carousel: Carousel, labels: CarouselLabels | undefined) => carousel.resolve(labels)?.selected.id;

describe("Carousel selection", () => {
	it("shows nothing without pasted images", () => {
		const carousel = new Carousel();
		assert.equal(carousel.resolve(undefined), undefined);
		assert.equal(carousel.resolve(fakeLabels().labels), undefined);
	});

	it("shows the image just pasted", () => {
		const carousel = new Carousel();
		const { labels, paste } = fakeLabels();
		paste(1);
		assert.equal(shown(carousel, labels), 1);
		paste(2);
		assert.deepEqual(carousel.resolve(labels), {
			entries: [{ id: 1, path: "/tmp/1.png" }, { id: 2, path: "/tmp/2.png" }],
			selected: { id: 2, path: "/tmp/2.png" },
			index: 1,
		});
	});

	it("follows the cursor onto a label", () => {
		const carousel = new Carousel();
		const { labels, state } = fakeLabels([1, 2, 3]);
		assert.equal(shown(carousel, labels), 3);
		state.cursor = 1;
		assert.equal(shown(carousel, labels), 1);
		state.cursor = undefined;
		assert.equal(shown(carousel, labels), 1, "leaving a label keeps the image shown");
	});

	it("steps with wrap-around and keeps the step while the cursor stays put", () => {
		const carousel = new Carousel();
		const { labels, state } = fakeLabels([1, 2, 3]);
		state.cursor = 2;
		assert.equal(shown(carousel, labels), 2);
		carousel.step(1);
		assert.equal(shown(carousel, labels), 3, "the cursor still touches [Image 2]");
		carousel.step(1);
		assert.equal(shown(carousel, labels), 1);
		carousel.step(-1);
		assert.equal(shown(carousel, labels), 3);
	});

	it("does nothing when stepping with no images", () => {
		const carousel = new Carousel();
		carousel.step(1);
		assert.equal(carousel.resolve(fakeLabels().labels), undefined);
	});

	it("falls back to the last image when the shown one is deleted", () => {
		const carousel = new Carousel();
		const { labels, state } = fakeLabels([1, 2, 3]);
		state.cursor = 2;
		assert.equal(shown(carousel, labels), 2);
		state.ids = [1, 3];
		state.cursor = undefined;
		assert.equal(shown(carousel, labels), 3);
	});
});

describe("carousel widget", () => {
	const theme = { header: (text: string) => `<${text}>` };
	const load = (path: string) => (path === "/tmp/9.png" ? undefined : { data: "AAAA", mimeType: "image/png" });

	it("renders nothing without images", () => {
		const widget = createCarouselWidget({ labels: () => undefined, carousel: new Carousel(), theme, load });
		assert.deepEqual(widget.render(80), []);
	});

	it("renders the navigator header, then the thumbnail", () => {
		const { labels } = fakeLabels([1, 2]);
		const widget = createCarouselWidget({ labels: () => labels, carousel: new Carousel(), theme, load });
		const lines = widget.render(80);
		assert.equal(lines[0], "<‹  [Image 2] · 2/2  ›   Ctrl+Shift+←/→>");
		assert.ok(lines.length >= 2, "a thumbnail (or its text fallback) follows the header");
	});

	it("reloads a path pasted again under a new label", () => {
		const { labels, paste } = fakeLabels();
		const loads: string[] = [];
		const counting = (path: string) => {
			loads.push(path);
			return { data: "AAAA", mimeType: "image/png" };
		};
		const widget = createCarouselWidget({ labels: () => labels, carousel: new Carousel(), theme, load: counting });
		paste(1);
		widget.render(80);
		widget.render(80);
		assert.equal(loads.length, 1, "the same label reuses its thumbnail");
		// fakeLabels gives every id its own path; a re-paste of the same file is a new id with the same path.
		labels.entries = () => [{ id: 1, path: "/tmp/1.png" }, { id: 2, path: "/tmp/1.png" }];
		paste(2);
		widget.render(80);
		assert.equal(loads.length, 2, "a new paste of the same path reads the file again");
	});

	it("reports an image that cannot be read", () => {
		const { labels } = fakeLabels([9]);
		const widget = createCarouselWidget({ labels: () => labels, carousel: new Carousel(), theme, load });
		assert.deepEqual(widget.render(80), ["<‹  [Image 9] · 1/1  ›   Ctrl+Shift+←/→>", "<Cannot read /tmp/9.png>"]);
	});
});

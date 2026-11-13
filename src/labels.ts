import { pathToFileURL } from "node:url";
import { isExistingFile, parseImagePaths } from "./image-paths.ts";

/** The parts of pi-tui's Editor this module wraps. */
export interface LabelTarget {
	handlePaste(text: string): void;
	insertTextAtCursor(text: string): void;
	segment(text: string, mode: "grapheme" | "word"): Iterable<SegmentLike>;
	expandPasteMarkers(text: string): string;
	submitValue(): void;
	render(width: number): string[];
	getText(): string;
	getCursor?(): { line: number; col: number };
}

interface SegmentLike {
	segment: string;
	index: number;
	input?: string;
	isWordLike?: boolean;
}

export interface LabelOptions {
	/** Styles a label for display, e.g. bold accent color. */
	style: (label: string) => string;
	isImageFile?: (path: string) => boolean;
}

export interface ImageEntry {
	id: number;
	path: string;
}

export interface ImageLabels {
	readonly count: number;
	/** Path of `[Image N]` in the draft, or in the last sent message that had labels. */
	pathOf(id: number): string | undefined;
	/** Pasted labels still in the draft, in text order. */
	entries(): ImageEntry[];
	/** Id of the draft label the cursor touches (inside, or right before or after), if any. */
	cursorLabel(): number | undefined;
	/** Labels created so far; grows on every image paste, across messages. */
	readonly pastes: number;
	/** Id of the most recently created label. */
	readonly lastPasted: number | undefined;
	uninstall(): void;
}

const LABELS = Symbol.for("pi-orca-images.labels");
const LABEL = /\[Image (\d+)\]/g;

const labelText = (id: number) => `[Image ${id}]`;

/**
 * Show pasted image paths as atomic `[Image N]` labels in Pi's editor.
 *
 * The label is what the user sees and edits; the path is what Pi submits, so the model and
 * the prompt history behave exactly as if the path had been pasted.
 */
export function installImageLabels(editor: LabelTarget, options: LabelOptions): ImageLabels {
	const host = editor as LabelTarget & { [LABELS]?: ImageLabels };
	const existing = host[LABELS];
	if (existing) return existing;

	const isImageFile = options.isImageFile ?? isExistingFile;
	const original = {
		handlePaste: editor.handlePaste,
		insertTextAtCursor: editor.insertTextAtCursor,
		segment: editor.segment,
		expandPasteMarkers: editor.expandPasteMarkers,
		submitValue: editor.submitValue,
		render: editor.render,
	};
	const ownKeys = Object.keys(original).filter((key) => Object.hasOwn(editor, key));
	const paths = new Map<number, string>();
	let sent = new Map<number, string>();
	let next = 1;
	let pastes = 0;
	let lastPasted: number | undefined;

	const known = (text: string) => [...text.matchAll(LABEL)].filter((m) => paths.has(Number(m[1])));

	/** Returns the labeled replacement for text made only of image paths, or undefined. */
	const labelFor = (text: string, spaceBefore: boolean, spaceAfter: boolean): string | undefined => {
		const parsed = parseImagePaths(text, isImageFile);
		if (!parsed) return undefined;
		if (known(editor.getText()).length === 0) {
			paths.clear();
			next = 1;
		}
		const labels = parsed.paths.map((path) => {
			const id = next++;
			paths.set(id, path);
			pastes++;
			lastPasted = id;
			return labelText(id);
		});
		const leading = parsed.leading || (spaceBefore ? " " : "");
		const trailing = parsed.trailing || (spaceAfter ? " " : "");
		return `${leading}${labels.join(" ")}${trailing}`;
	};

	const neighbors = () => {
		const cursor = editor.getCursor?.();
		if (!cursor) return { before: "", after: "" };
		const line = editor.getText().split("\n")[cursor.line] ?? "";
		return { before: line[cursor.col - 1] ?? "", after: line[cursor.col] ?? "" };
	};
	const needsSpace = (ch: string) => ch !== "" && !/\s/.test(ch);

	editor.handlePaste = function (text: string) {
		const { before, after } = neighbors();
		const labeled = labelFor(text, needsSpace(before), after === "" || needsSpace(after));
		if (labeled === undefined) return original.handlePaste.call(this, text);
		return original.insertTextAtCursor.call(this, labeled);
	};

	editor.insertTextAtCursor = function (text: string) {
		const labeled = labelFor(text, false, false);
		return original.insertTextAtCursor.call(this, labeled ?? text);
	};

	editor.segment = function (text: string, mode: "grapheme" | "word") {
		const base = original.segment.call(this, text, mode);
		const spans = known(text).map((m) => ({ start: m.index, end: m.index + m[0].length }));
		if (spans.length === 0) return base;
		const merged: SegmentLike[] = [];
		let span = 0;
		for (const seg of base) {
			while (span < spans.length && spans[span]!.end <= seg.index) span++;
			const current = spans[span];
			if (current && seg.index >= current.start && seg.index < current.end) {
				if (seg.index === current.start) {
					merged.push({ ...seg, segment: text.slice(current.start, current.end), isWordLike: true });
				}
				continue;
			}
			merged.push(seg);
		}
		return merged;
	};

	editor.expandPasteMarkers = function (text: string) {
		const expanded = text.replace(LABEL, (label, id: string) => paths.get(Number(id)) ?? label);
		return original.expandPasteMarkers.call(this, expanded);
	};

	editor.submitValue = function () {
		try {
			return original.submitValue.call(this);
		} finally {
			if (paths.size > 0) sent = new Map(paths);
			paths.clear();
			next = 1;
		}
	};

	// Each known label is an OSC 8 link to its file: Cmd-click opens it in terminals that support links.
	editor.render = function (width: number) {
		const lines = original.render.call(this, width);
		if (paths.size === 0) return lines;
		return lines.map((line) =>
			line.replace(LABEL, (label, id: string) => {
				const path = paths.get(Number(id));
				if (path === undefined) return label;
				return `\x1b]8;;${pathToFileURL(path).href}\x07${options.style(label)}\x1b]8;;\x07`;
			}),
		);
	};

	const labels: ImageLabels = {
		get count() {
			return paths.size;
		},
		pathOf(id: number) {
			return paths.get(id) ?? sent.get(id);
		},
		entries() {
			return known(editor.getText()).map((m) => ({ id: Number(m[1]), path: paths.get(Number(m[1])) ?? "" }));
		},
		cursorLabel() {
			const cursor = editor.getCursor?.();
			if (!cursor || paths.size === 0) return undefined;
			const line = editor.getText().split("\n")[cursor.line] ?? "";
			const hit = known(line).find((m) => cursor.col >= m.index && cursor.col <= m.index + m[0].length);
			return hit ? Number(hit[1]) : undefined;
		},
		get pastes() {
			return pastes;
		},
		get lastPasted() {
			return lastPasted;
		},
		uninstall() {
			// SAFETY: every key restored below is one of the editor methods captured in `original`.
			const target = editor as unknown as Record<string, unknown>;
			for (const [key, value] of Object.entries(original)) {
				// Restore earlier own wrappers; otherwise fall back to the prototype method.
				if (ownKeys.includes(key)) target[key] = value;
				else delete target[key];
			}
			delete host[LABELS];
		},
	};
	host[LABELS] = labels;
	return labels;
}

/** Find pi-tui editors in a component tree (TUI → containers → editor). */
export function findEditors(root: unknown): LabelTarget[] {
	const found: LabelTarget[] = [];
	const seen = new Set<unknown>();
	const visit = (node: unknown) => {
		if (!node || typeof node !== "object" || seen.has(node)) return;
		seen.add(node);
		const candidate = node as Partial<LabelTarget> & { pastes?: unknown; children?: unknown };
		if (
			typeof candidate.handlePaste === "function" &&
			typeof candidate.segment === "function" &&
			typeof candidate.expandPasteMarkers === "function" &&
			candidate.pastes instanceof Map
		) {
			found.push(candidate as LabelTarget);
		}
		if (Array.isArray(candidate.children)) for (const child of candidate.children) visit(child);
	};
	visit(root);
	return found;
}

export interface EditorWatcher {
	readonly editors: number;
	/** Path of `[Image N]` in any watched editor, as in {@link ImageLabels.pathOf}. */
	pathOf(id: number): string | undefined;
	/** Labels of the editor that has pasted images in its draft, else of the first watched editor. */
	current(): ImageLabels | undefined;
	uninstall(): void;
}

/**
 * Label every editor in the TUI tree, checked before each render. Pi and extensions can swap the
 * editor at any time (custom editors, settings changes), so a one-time lookup is not enough.
 *
 * Pi hands extensions a Proxy over the TUI whose own-property checks and deletes never reach the
 * TUI, so uninstall restores by assignment and the wrapper turns inert even if something else
 * still holds it: a leftover wrapper would relabel editors with a stale session's style.
 */
export function watchEditors(
	tui: { doRender?: (...args: unknown[]) => unknown },
	options: LabelOptions,
): EditorWatcher {
	const installed = new Map<LabelTarget, ImageLabels>();
	const originalRender = tui.doRender;
	let active = true;
	if (originalRender) {
		tui.doRender = function (this: unknown, ...args: unknown[]) {
			if (active) {
				for (const editor of findEditors(tui)) {
					if (!installed.has(editor)) installed.set(editor, installImageLabels(editor, options));
				}
			}
			return originalRender.apply(this, args);
		};
	}
	return {
		get editors() {
			return installed.size;
		},
		pathOf(id: number) {
			for (const labels of installed.values()) {
				const path = labels.pathOf(id);
				if (path !== undefined) return path;
			}
			return undefined;
		},
		current() {
			const all = [...installed.values()];
			return all.find((labels) => labels.count > 0) ?? all[0];
		},
		uninstall() {
			active = false;
			for (const labels of installed.values()) labels.uninstall();
			installed.clear();
			if (originalRender) tui.doRender = originalRender;
		},
	};
}

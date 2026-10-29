import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Editor } from "@earendil-works/pi-tui";
import { findEditors, installImageLabels, type LabelTarget } from "../src/labels.ts";
import { piTuiProxy } from "./pi-tui-proxy.ts";

const PASTE = (text: string) => `\x1b[200~${text}\x1b[201~`;
const BACKSPACE = "\x7f";
const ENTER = "\r";
const IMAGES = new Set(["/tmp/a.png", "/tmp/b.png"]);

function setup() {
	const tui = { terminal: { rows: 40, columns: 80 }, requestRender() {} };
	const editor = new Editor(tui as never, { borderColor: (s: string) => s, selectList: {} as never });
	const submitted: string[] = [];
	editor.onSubmit = (text: string) => void submitted.push(text);
	const labels = installImageLabels(editor as unknown as LabelTarget, {
		style: (label) => `<${label}>`,
		isImageFile: (path) => IMAGES.has(path),
	});
	return { editor, submitted, labels, type: (data: string) => editor.handleInput(data) };
}

function typeText(editor: Editor, text: string) {
	for (const ch of text) editor.handleInput(ch);
}

describe("image labels: paste", () => {
	it("replaces a pasted image path with a label and submits the path", () => {
		const { editor, submitted, type } = setup();
		typeText(editor, "look");
		type(PASTE("/tmp/a.png"));
		assert.equal(editor.getText(), "look [Image 1] ");
		typeText(editor, "now");
		type(ENTER);
		assert.deepEqual(submitted, ["look /tmp/a.png now"]);
	});

	it("numbers several images and labels a multi-path paste", () => {
		const { editor, submitted, type } = setup();
		type(PASTE("/tmp/a.png"));
		type(PASTE("/tmp/a.png\n/tmp/b.png"));
		assert.equal(editor.getText(), "[Image 1] [Image 2] [Image 3] ");
		type(ENTER);
		assert.deepEqual(submitted, ["/tmp/a.png /tmp/a.png /tmp/b.png"]);
	});

	it("leaves ordinary pastes untouched", () => {
		const { editor, type } = setup();
		type(PASTE("hello"));
		type(PASTE(" /tmp/missing.png"));
		assert.equal(editor.getText(), "hello /tmp/missing.png");
	});

	it("keeps large-paste markers working", () => {
		const { editor, submitted, type } = setup();
		const big = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
		type(PASTE(big));
		assert.equal(editor.getText(), "[paste #1 +12 lines]");
		type(ENTER);
		assert.deepEqual(submitted, [big]);
	});

	it("labels paths inserted programmatically (Pi's Ctrl+V)", () => {
		const { editor, submitted, type } = setup();
		typeText(editor, "x");
		editor.insertTextAtCursor(" /tmp/b.png");
		assert.equal(editor.getText(), "x [Image 1]");
		type(ENTER);
		assert.deepEqual(submitted, ["x /tmp/b.png"]);
	});

	it("passes other programmatic text through", () => {
		const { editor } = setup();
		editor.insertTextAtCursor("plain");
		assert.equal(editor.getText(), "plain");
	});
});

describe("image labels: editing", () => {
	it("deletes a label with one backspace", () => {
		const { editor, type } = setup();
		typeText(editor, "a ");
		type(PASTE("/tmp/a.png"));
		type(BACKSPACE);
		type(BACKSPACE);
		assert.equal(editor.getText(), "a ");
	});

	it("restarts numbering once no label is left", () => {
		const { editor, type } = setup();
		type(PASTE("/tmp/a.png"));
		type(BACKSPACE);
		type(BACKSPACE);
		assert.equal(editor.getText(), "");
		type(PASTE("/tmp/b.png"));
		assert.equal(editor.getText(), "[Image 1] ");
	});

	it("restarts numbering and forgets paths after submit", () => {
		const { editor, submitted, type } = setup();
		type(PASTE("/tmp/a.png"));
		type(ENTER);
		typeText(editor, "[Image 1]");
		type(ENTER);
		type(PASTE("/tmp/b.png"));
		type(ENTER);
		assert.deepEqual(submitted, ["/tmp/a.png", "[Image 1]", "/tmp/b.png"]);
	});

	it("does not expand a label the user typed", () => {
		const { editor, submitted, type } = setup();
		type(PASTE("/tmp/a.png"));
		typeText(editor, "[Image 2]");
		type(ENTER);
		assert.deepEqual(submitted, ["/tmp/a.png [Image 2]"]);
	});
});

describe("image labels: render", () => {
	it("styles known labels only", () => {
		const { editor, type } = setup();
		type(PASTE("/tmp/a.png"));
		typeText(editor, "[Image 9]");
		const body = editor.render(80).slice(1, -1).join("\n");
		assert.match(body, /<\[Image 1\]>/);
		assert.doesNotMatch(body, /<\[Image 9\]>/);
	});
});

describe("image labels: lifecycle", () => {
	it("is idempotent and uninstall restores plain paths", () => {
		const { editor, labels, type } = setup();
		assert.equal(installImageLabels(editor as unknown as LabelTarget, { style: (s) => s, isImageFile: () => true }), labels);
		labels.uninstall();
		type(PASTE("/tmp/a.png"));
		assert.equal(editor.getText(), "/tmp/a.png");
	});

	it("finds editors in a component tree", () => {
		const { editor } = setup();
		const tree = { children: [{ children: [] }, { children: [{ children: [editor] }] }] };
		assert.deepEqual(findEditors(tree), [editor]);
	});
});

describe("watchEditors", () => {
	it("labels editors found at render time and uninstalls cleanly", async () => {
		const { watchEditors } = await import("../src/labels.ts");
		const tui = { terminal: { rows: 40, columns: 80 }, requestRender() {} };
		const editor = new Editor(tui as never, { borderColor: (s: string) => s, selectList: {} as never });
		const host = {
			children: [] as unknown[],
			doRender() {
				return "rendered";
			},
		};
		const render = host.doRender;
		const watcher = watchEditors(host, { style: (s) => s, isImageFile: (p) => IMAGES.has(p) });
		host.children.push(editor);
		assert.equal(host.doRender(), "rendered");
		editor.handleInput(PASTE("/tmp/a.png"));
		assert.equal(editor.getText(), "[Image 1] ");
		assert.equal(watcher.editors, 1);
		watcher.uninstall();
		assert.equal(host.doRender, render);
		editor.handleInput(PASTE("/tmp/b.png"));
		assert.equal(editor.getText(), "[Image 1] /tmp/b.png");
	});

	it("uninstalls through Pi's TUI proxy", async () => {
		const { watchEditors } = await import("../src/labels.ts");
		const tui = { terminal: { rows: 40, columns: 80 }, requestRender() {} };
		const editor = new Editor(tui as never, { borderColor: (s: string) => s, selectList: {} as never });
		const host = {
			children: [editor] as unknown[],
			doRender() {
				return "rendered";
			},
		};
		const watcher = watchEditors(piTuiProxy(() => host), { style: (s) => s, isImageFile: (p) => IMAGES.has(p) });
		assert.equal(host.doRender(), "rendered");
		editor.handleInput(PASTE("/tmp/a.png"));
		assert.equal(editor.getText(), "[Image 1] ");
		watcher.uninstall();
		// Pi keeps rendering after the session is replaced; the old watcher must not relabel.
		assert.equal(host.doRender(), "rendered");
		editor.handleInput(PASTE("/tmp/b.png"));
		assert.equal(editor.getText(), "[Image 1] /tmp/b.png");
	});
});

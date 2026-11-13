import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Editor } from "@earendil-works/pi-tui";
import piOrcaImages from "../src/index.ts";
import { piTuiProxy } from "./pi-tui-proxy.ts";

const STALE = "This extension ctx is stale after session replacement or reload.";

const ENV_KEYS = ["TERM_PROGRAM", "ORCA_IMAGE_PROTOCOL", "PI_IMAGE_PROTOCOL", "PI_ORCA_IMAGES_OWNED", "TMUX", "TERM"];
let saved: Record<string, string | undefined> = {};

function fakeTui() {
	let cleared = 0;
	const renders: boolean[] = [];
	return {
		renders,
		cleared: () => cleared,
		children: [] as unknown[],
		uploadedKittyImages: { clear: () => void cleared++ },
		doRender() {},
		handleViewportInput() {},
		requestRender(force?: boolean) {
			renders.push(force === true);
		},
	};
}

type Shortcut = { description?: string; handler: (ctx: unknown) => unknown };

function load(shortcuts = new Map<string, Shortcut>()) {
	const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
	const pi = {
		on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => void handlers.set(event, handler),
		registerEntryRenderer() {},
		registerCommand() {},
		registerShortcut: (key: string, options: Shortcut) => void shortcuts.set(key, options),
	};
	piOrcaImages(pi as never);
	return handlers;
}

type Factory = (tui: unknown, theme: unknown) => unknown;

/** lazy: store the widget factory like Pi does while it rebinds a replaced session. */
function ctxFor(tui: ReturnType<typeof fakeTui>, lazy?: Factory[]) {
	return {
		hasUI: true,
		ui: {
			theme: { fg: (_c: string, s: string) => s, bold: (s: string) => s },
			setWidget(_key: string, factory?: Factory) {
				if (!factory) return;
				if (lazy) lazy.push(factory);
				else factory(tui, {});
			},
		},
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("session lifecycle in Orca", () => {
	before(() => {
		saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
		for (const key of ENV_KEYS) delete process.env[key];
		process.env.TERM_PROGRAM = "Orca";
		process.env.ORCA_IMAGE_PROTOCOL = "kitty";
	});

	after(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	for (const reason of ["startup", "resume", "new", "fork", "reload"]) {
		it(`redraws every image once the fix is installed (${reason})`, async () => {
			const tui = fakeTui();
			const handlers = load();
			await handlers.get("session_start")?.({ type: "session_start", reason }, ctxFor(tui));
			await tick();
			// Anything Pi drew before the fix was installed is sent again in full.
			assert.equal(tui.cleared(), 1);
			assert.deepEqual(tui.renders, [true]);
			await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
		});
	}

	it("redraws when Pi calls the widget factory after session_start", async () => {
		const tui = fakeTui();
		const lazy: Factory[] = [];
		const handlers = load();
		await handlers.get("session_start")?.({ type: "session_start", reason: "resume" }, ctxFor(tui, lazy));
		for (const factory of lazy) factory(tui, {});
		await tick();
		assert.equal(tui.cleared(), 1);
		assert.deepEqual(tui.renders, [true]);
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
	});

	for (const reason of ["resume", "new", "fork", "reload"]) {
		it(`keeps the repaint fix across session replacement (${reason})`, async () => {
			const tui = fakeTui();
			const render = tui.doRender;
			const handlers = load();
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctxFor(tui));
			await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason }, ctxFor(tui));
			// Pi draws the next session's transcript before session_start: the fix must still be there.
			assert.notEqual(tui.doRender, render);
			const next = load();
			await next.get("session_start")?.({ type: "session_start", reason }, ctxFor(tui));
			await next.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
			assert.equal(tui.doRender, render);
		});
	}

	for (const reason of ["resume", "new", "fork", "reload"]) {
		it(`styles image labels with the live session after replacement (${reason})`, async () => {
			const dir = mkdtempSync(join(tmpdir(), "pi-orca-images-"));
			const image = join(dir, "shot.png");
			writeFileSync(image, "");
			try {
				const editor = new Editor({ terminal: { rows: 40, columns: 80 }, requestRender() {} } as never, {
					borderColor: (s: string) => s,
					selectList: {} as never,
				});
				const tui = Object.assign(fakeTui(), { children: [editor] as unknown[] });
				const proxy = piTuiProxy(() => tui);
				// Like Pi's ExtensionRunner: once the session is replaced, every ctx.ui read throws.
				const session = (color: string) => {
					let stale = false;
					const ctx = {
						hasUI: true,
						get ui() {
							if (stale) throw new Error(STALE);
							return {
								theme: { fg: (_c: string, s: string) => `<${color}:${s}>`, bold: (s: string) => s },
								setWidget(_key: string, factory?: Factory) {
									factory?.(proxy, {});
								},
							};
						},
					};
					return { ctx, invalidate: () => void (stale = true) };
				};
				const first = session("old");
				const handlers = load();
				await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, first.ctx);
				tui.doRender();
				await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason }, first.ctx);
				first.invalidate();
				// Pi draws the next transcript before the next session_start.
				tui.doRender();
				const second = session("new");
				const next = load();
				await next.get("session_start")?.({ type: "session_start", reason }, second.ctx);
				tui.doRender();
				editor.handleInput(`\x1b[200~${image}\x1b[201~`);
				tui.doRender();
				const body = editor.render(80).join("\n");
				assert.match(body, /<new:\[Image 1\]>/);
				await next.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, second.ctx);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}

	it("removes the repaint fix on quit", async () => {
		const tui = fakeTui();
		const render = tui.doRender;
		const handlers = load();
		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctxFor(tui));
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
		assert.equal(tui.doRender, render);
	});
});

describe("pasted image preview", () => {
	const PREVIEW_KEYS = [...ENV_KEYS, "PI_IMAGE_PREVIEW", "PI_IMAGE_LABELS"];
	let savedPreview: Record<string, string | undefined> = {};
	before(() => {
		savedPreview = Object.fromEntries(PREVIEW_KEYS.map((key) => [key, process.env[key]]));
		for (const key of PREVIEW_KEYS) delete process.env[key];
	});
	after(() => {
		for (const [key, value] of Object.entries(savedPreview)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	type Widget = { render(width: number): string[] };

	function start(env: Record<string, string> = {}) {
		Object.assign(process.env, env);
		const dir = mkdtempSync(join(tmpdir(), "pi-orca-images-"));
		const images = ["one.png", "two.png"].map((name) => {
			const path = join(dir, name);
			writeFileSync(path, "");
			return path;
		});
		const editor = new Editor({ terminal: { rows: 40, columns: 80 }, requestRender() {} } as never, {
			borderColor: (s: string) => s,
			selectList: {} as never,
		});
		const tui = Object.assign(fakeTui(), { children: [editor] as unknown[] });
		const widgets = new Map<string, { widget: Widget; placement?: string }>();
		const ctx = {
			hasUI: true,
			ui: {
				theme: { fg: (_c: string, s: string) => s, bold: (s: string) => s },
				setWidget(key: string, factory?: Factory, options?: { placement?: string }) {
					if (!factory) return void widgets.delete(key);
					widgets.set(key, { widget: factory(tui, { fg: (_c: string, s: string) => s, bold: (s: string) => s }) as Widget, placement: options?.placement });
				},
			},
		};
		const shortcuts = new Map<string, Shortcut>();
		const handlers = load(shortcuts);
		const cleanup = async () => {
			await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctx);
			rmSync(dir, { recursive: true, force: true });
			for (const key of Object.keys(env)) delete process.env[key];
		};
		const paste = (path: string) => {
			editor.handleInput(`\x1b[200~${path}\x1b[201~`);
			tui.doRender();
		};
		return { handlers, ctx, tui, editor, widgets, shortcuts, images, paste, cleanup };
	}

	it("shows the pasted image above the prompt and steps with Ctrl+Shift+arrows", async () => {
		const t = start();
		try {
			await t.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, t.ctx);
			t.tui.doRender();
			const preview = [...t.widgets.values()].find((entry) => entry.placement === "aboveEditor");
			assert.ok(preview, "an aboveEditor widget is registered");
			assert.deepEqual(preview.widget.render(80), [], "nothing to show before a paste");
			t.paste(t.images[0]!);
			t.paste(t.images[1]!);
			assert.match(preview.widget.render(80).at(-1) ?? "", /\[Image 2\].*2\/2/);
			assert.deepEqual([...t.shortcuts.keys()].sort(), ["ctrl+shift+left", "ctrl+shift+right"]);
			const renders = t.tui.renders.length;
			await t.shortcuts.get("ctrl+shift+right")?.handler({});
			assert.match(preview.widget.render(80).at(-1) ?? "", /\[Image 1\].*1\/2/);
			assert.ok(t.tui.renders.length > renders, "a step requests a render");
			await t.shortcuts.get("ctrl+shift+left")?.handler({});
			assert.match(preview.widget.render(80).at(-1) ?? "", /\[Image 2\].*2\/2/);
			t.editor.handleInput("\r");
			assert.deepEqual(preview.widget.render(80), [], "cleared once the message is sent");
		} finally {
			await t.cleanup();
		}
	});

	const disabled: Record<string, string>[] = [{ PI_IMAGE_PREVIEW: "0" }, { PI_IMAGE_LABELS: "0" }];
	for (const env of disabled) {
		it(`registers no preview with ${Object.keys(env)[0]}=0`, async () => {
			const t = start(env);
			try {
				await t.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, t.ctx);
				assert.equal([...t.widgets.values()].filter((entry) => entry.placement === "aboveEditor").length, 0);
				await t.shortcuts.get("ctrl+shift+right")?.handler({});
			} finally {
				await t.cleanup();
			}
		});
	}
});

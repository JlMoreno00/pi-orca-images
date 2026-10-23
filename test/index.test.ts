import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import piOrcaImages from "../src/index.ts";

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

function load() {
	const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
	const pi = {
		on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => void handlers.set(event, handler),
		registerEntryRenderer() {},
		registerCommand() {},
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

	it("removes the repaint fix on quit", async () => {
		const tui = fakeTui();
		const render = tui.doRender;
		const handlers = load();
		await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctxFor(tui));
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
		assert.equal(tui.doRender, render);
	});
});

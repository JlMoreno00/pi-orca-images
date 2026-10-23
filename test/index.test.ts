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

function ctxFor(tui: ReturnType<typeof fakeTui>) {
	return {
		hasUI: true,
		ui: {
			theme: { fg: (_c: string, s: string) => s, bold: (s: string) => s },
			setWidget(_key: string, factory?: (tui: unknown, theme: unknown) => unknown) {
				factory?.(tui, {});
			},
		},
	};
}

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
			// Pi renders the resumed transcript before session_start, without the fix.
			assert.equal(tui.cleared(), 1);
			assert.deepEqual(tui.renders, [true]);
			await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctxFor(tui));
		});
	}
});

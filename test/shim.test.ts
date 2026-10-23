import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOCUS_IN, installShim, RECOVERY_DELAYS_MS, type ShimTarget } from "../src/shim.ts";

function fakeTui(env: Record<string, string | undefined>) {
	const seen: Array<string | undefined> = [];
	const renders: boolean[] = [];
	let cleared = 0;
	const inputs: string[] = [];
	const tui: ShimTarget & { seen: typeof seen; renders: typeof renders; cleared: () => number; inputs: string[] } = {
		seen,
		renders,
		inputs,
		cleared: () => cleared,
		uploadedKittyImages: { clear: () => void cleared++ },
		doRender() {
			seen.push(env.WEZTERM_PANE);
			return "rendered";
		},
		handleViewportInput(data: string) {
			inputs.push(data);
			return { consume: data === FOCUS_IN };
		},
		requestRender(force?: boolean) {
			renders.push(force === true);
		},
	};
	return tui;
}

function fakeTimers() {
	const pending = new Map<number, { ms: number; fn: () => void }>();
	let next = 1;
	return {
		pending,
		setTimer: (fn: () => void, ms: number) => {
			const id = next++;
			pending.set(id, { ms, fn });
			return id;
		},
		clearTimer: (id: unknown) => void pending.delete(id as number),
		fireAll() {
			for (const [id, timer] of [...pending]) {
				pending.delete(id);
				timer.fn();
			}
		},
	};
}

describe("installShim render patch", () => {
	it("sets WEZTERM_PANE only while Pi renders", () => {
		const env: Record<string, string | undefined> = {};
		const tui = fakeTui(env);
		const shim = installShim(tui, { env });
		assert.equal(tui.doRender?.(), "rendered");
		assert.deepEqual(tui.seen, ["pi-orca-images"]);
		assert.equal("WEZTERM_PANE" in env, false);
		assert.equal(shim.renderPatched, true);
	});

	it("restores the environment when rendering throws", () => {
		const env: Record<string, string | undefined> = {};
		const tui = fakeTui(env);
		tui.doRender = () => {
			throw new Error("boom");
		};
		installShim(tui, { env });
		assert.throws(() => tui.doRender?.(), /boom/);
		assert.equal("WEZTERM_PANE" in env, false);
	});

	it("keeps a real WEZTERM_PANE untouched", () => {
		const env: Record<string, string | undefined> = { WEZTERM_PANE: "7" };
		const tui = fakeTui(env);
		installShim(tui, { env });
		tui.doRender?.();
		assert.deepEqual(tui.seen, ["7"]);
		assert.equal(env.WEZTERM_PANE, "7");
	});
});

describe("installShim focus recovery", () => {
	it("schedules recoveries on focus-in and forwards the input", () => {
		const env = {};
		const timers = fakeTimers();
		const tui = fakeTui(env);
		const shim = installShim(tui, { env, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
		assert.deepEqual(tui.handleViewportInput?.(FOCUS_IN), { consume: true });
		assert.deepEqual(tui.inputs, [FOCUS_IN]);
		assert.deepEqual([...timers.pending.values()].map((t) => t.ms), RECOVERY_DELAYS_MS);
		timers.fireAll();
		assert.equal(tui.cleared(), RECOVERY_DELAYS_MS.length);
		assert.deepEqual(tui.renders, RECOVERY_DELAYS_MS.map(() => true));
		assert.equal(shim.recoveries, RECOVERY_DELAYS_MS.length);
	});

	it("ignores other input", () => {
		const timers = fakeTimers();
		const tui = fakeTui({});
		installShim(tui, { env: {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
		assert.deepEqual(tui.handleViewportInput?.("a"), { consume: false });
		assert.equal(timers.pending.size, 0);
	});

	it("restarts the schedule on repeated focus-in", () => {
		const timers = fakeTimers();
		const tui = fakeTui({});
		installShim(tui, { env: {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
		tui.handleViewportInput?.(FOCUS_IN);
		tui.handleViewportInput?.(FOCUS_IN);
		assert.equal(timers.pending.size, RECOVERY_DELAYS_MS.length);
	});

	it("recover() clears the upload cache and forces a full render", () => {
		const tui = fakeTui({});
		const shim = installShim(tui, { env: {} });
		shim.recover();
		assert.equal(tui.cleared(), 1);
		assert.deepEqual(tui.renders, [true]);
	});
});

describe("installShim lifecycle", () => {
	it("is idempotent per TUI", () => {
		const tui = fakeTui({});
		const first = installShim(tui, { env: {} });
		assert.equal(installShim(tui, { env: {} }), first);
	});

	it("uninstall restores the original methods and cancels timers", () => {
		const timers = fakeTimers();
		const tui = fakeTui({});
		const render = tui.doRender;
		const input = tui.handleViewportInput;
		const shim = installShim(tui, { env: {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
		tui.handleViewportInput?.(FOCUS_IN);
		shim.uninstall();
		assert.equal(tui.doRender, render);
		assert.equal(tui.handleViewportInput, input);
		assert.equal(timers.pending.size, 0);
		assert.notEqual(installShim(tui, { env: {} }), shim);
	});

	it("reports missing hooks on a TUI without them", () => {
		const shim = installShim({ requestRender() {} }, { env: {} });
		assert.equal(shim.renderPatched, false);
		assert.equal(shim.focusPatched, false);
	});
});

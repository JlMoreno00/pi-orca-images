/** Focus-in report; Pi enables focus reporting (DECSET 1004) in fullscreen mode. */
export const FOCUS_IN = "\x1b[I";

/**
 * Orca rebuilds a pane from its snapshot about 1.5-3 s after the tab is shown again,
 * which wipes every inline image. Repainting at several points outlasts that restore.
 */
export const RECOVERY_DELAYS_MS = [300, 1500, 3000, 5000];

/** The parts of Pi's TUI the shim touches. Every member except requestRender is optional. */
export interface ShimTarget {
	doRender?: (...args: unknown[]) => unknown;
	handleViewportInput?: (data: string) => unknown;
	uploadedKittyImages?: { clear(): void };
	requestRender(force?: boolean): void;
}

export interface ShimOptions {
	env?: Record<string, string | undefined>;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (handle: unknown) => void;
	delays?: readonly number[];
}

export interface Shim {
	readonly renderPatched: boolean;
	readonly focusPatched: boolean;
	readonly recoveries: number;
	recover(): void;
	uninstall(): void;
}

const SHIM = Symbol.for("pi-orca-images.shim");
const WEZTERM_MARKER = "pi-orca-images";

const defaultSetTimer = (fn: () => void, ms: number) => {
	const handle = setTimeout(fn, ms);
	handle.unref?.();
	return handle;
};
const defaultClearTimer = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>);

/**
 * Patch one Pi TUI instance for Orca.
 *
 * Render: xterm's image addon stores Kitty images per cell, so Pi's later line writes erase
 * every row but the first. Pi already draws images last for WezTerm, which has the same
 * behavior; the shim enables that path only during the synchronous render, so the variable
 * never reaches child processes.
 *
 * Focus: when the tab is shown again, the shim clears Pi's upload cache and forces a full
 * render, so images Orca dropped while hidden are sent again.
 */
export function installShim(tui: ShimTarget, options: ShimOptions = {}): Shim {
	const host = tui as ShimTarget & { [SHIM]?: Shim };
	const existing = host[SHIM];
	if (existing) return existing;

	const env = options.env ?? process.env;
	const setTimer = options.setTimer ?? defaultSetTimer;
	const clearTimer = options.clearTimer ?? defaultClearTimer;
	const delays = options.delays ?? RECOVERY_DELAYS_MS;
	const originalRender = tui.doRender;
	const originalInput = tui.handleViewportInput;
	let timers: unknown[] = [];
	let recoveries = 0;

	const cancel = () => {
		for (const timer of timers) clearTimer(timer);
		timers = [];
	};

	const shim: Shim = {
		renderPatched: typeof originalRender === "function",
		focusPatched: typeof originalInput === "function",
		get recoveries() {
			return recoveries;
		},
		recover() {
			recoveries++;
			tui.uploadedKittyImages?.clear();
			tui.requestRender(true);
		},
		uninstall() {
			cancel();
			if (shim.renderPatched) tui.doRender = originalRender;
			if (shim.focusPatched) tui.handleViewportInput = originalInput;
			delete host[SHIM];
		},
	};

	if (originalRender) {
		tui.doRender = function (this: unknown, ...args: unknown[]) {
			if (env.WEZTERM_PANE !== undefined) return originalRender.apply(this, args);
			env.WEZTERM_PANE = WEZTERM_MARKER;
			try {
				return originalRender.apply(this, args);
			} finally {
				delete env.WEZTERM_PANE;
			}
		};
	}

	if (originalInput) {
		tui.handleViewportInput = function (this: unknown, data: string) {
			if (data === FOCUS_IN) {
				cancel();
				timers = delays.map((ms) => setTimer(() => shim.recover(), ms));
			}
			return originalInput.call(this, data);
		};
	}

	host[SHIM] = shim;
	return shim;
}

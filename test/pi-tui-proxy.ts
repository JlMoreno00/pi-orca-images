/**
 * The TUI reference Pi 1.4.0 hands to extensions (createInteractiveTuiReference): a Proxy over an
 * empty target with only get/set/has/getPrototypeOf traps. Own-property checks and deletes hit the
 * empty target, not the TUI, and every method read returns a fresh forwarding closure.
 */
export function piTuiProxy<T extends object>(getTui: () => T): T {
	return new Proxy({} as T, {
		get: (_target, property) => {
			const tui = getTui();
			const value = Reflect.get(tui, property, tui);
			if (typeof value !== "function") return value;
			let methodTui = tui;
			let method = value as (...args: unknown[]) => unknown;
			return (...args: unknown[]) => {
				const currentTui = getTui();
				if (currentTui !== methodTui) {
					methodTui = currentTui;
					method = Reflect.get(currentTui, property, currentTui) as typeof method;
				}
				return Reflect.apply(method, methodTui, args);
			};
		},
		set: (_target, property, value) => {
			const tui = getTui();
			return Reflect.set(tui, property, value, tui);
		},
		has: (_target, property) => Reflect.has(getTui(), property),
		getPrototypeOf: () => Reflect.getPrototypeOf(getTui()),
	});
}

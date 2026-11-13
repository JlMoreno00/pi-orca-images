export const SUBCOMMANDS = ["status", "test", "redraw", "open"] as const;

/**
 * Argument completions for /orca-images. A complete subcommand yields none, so the first
 * Enter runs the command instead of accepting a suggestion identical to the input.
 */
export function completeSubcommand(prefix: string): Array<{ value: string; label: string }> | null {
	const typed = prefix.trim();
	if ((SUBCOMMANDS as readonly string[]).includes(typed)) return null;
	const matches = SUBCOMMANDS.filter((value) => value.startsWith(typed)).map((value) => ({ value, label: value }));
	return matches.length > 0 ? matches : null;
}

export type ParsedCommand =
	| { sub: (typeof SUBCOMMANDS)[number]; image?: number }
	| { sub: "invalid" };

/** Parse /orca-images arguments: a subcommand, plus an optional image number for `open`. */
export function parseCommand(args: string | undefined): ParsedCommand {
	const [sub = "status", ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);
	if (!(SUBCOMMANDS as readonly string[]).includes(sub)) return { sub: "invalid" };
	if (rest.length === 0) return { sub: sub as (typeof SUBCOMMANDS)[number] };
	const [number] = rest;
	if (sub === "open" && rest.length === 1 && number !== undefined && /^[1-9]\d*$/.test(number)) {
		return { sub, image: Number(number) };
	}
	return { sub: "invalid" };
}

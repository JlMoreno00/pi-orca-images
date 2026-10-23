export const SUBCOMMANDS = ["status", "test", "redraw"] as const;

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

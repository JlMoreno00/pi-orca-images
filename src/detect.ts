export type ImageProtocol = "kitty" | "iterm2";

export type Decision =
	| { action: "apply"; protocol: ImageProtocol; reason: string }
	| { action: "skip"; reason: string }
	| { action: "clear-inherited"; reason: string };

export type Env = Record<string, string | undefined>;

/** Records the PI_IMAGE_PROTOCOL value this package set, so a later run can tell it from a user choice. */
export const OWNED_ENV = "PI_ORCA_IMAGES_OWNED";

const DISABLED = new Set(["0", "false", "off", "no"]);

/** Decide whether Pi should draw images, from the environment alone. */
export function decide(env: Env): Decision {
	const owned = env[OWNED_ENV];
	const current = env.PI_IMAGE_PROTOCOL;
	const inherited = current !== undefined && current === owned;
	const skip = (reason: string): Decision =>
		inherited ? { action: "clear-inherited", reason } : { action: "skip", reason };

	if (DISABLED.has((env.PI_ORCA_IMAGES ?? "").toLowerCase())) return skip("disabled by PI_ORCA_IMAGES");
	if (current && !inherited) return { action: "skip", reason: `PI_IMAGE_PROTOCOL=${current} is set explicitly` };

	const term = (env.TERM ?? "").toLowerCase();
	if (env.TMUX || term.startsWith("tmux") || term.startsWith("screen")) {
		return skip("inside tmux or screen; image escapes do not reach Orca");
	}

	const advertised = env.ORCA_IMAGE_PROTOCOL;
	if (!advertised) {
		if ((env.TERM_PROGRAM ?? "").toLowerCase() === "orca") {
			return skip("Orca does not advertise inline images (ORCA_IMAGE_PROTOCOL is unset); update Orca");
		}
		return skip("not running inside Orca");
	}

	const protocol = advertised.toLowerCase();
	if (protocol !== "kitty" && protocol !== "iterm2") {
		return skip(`Orca advertises ORCA_IMAGE_PROTOCOL=${advertised}, which Pi cannot draw`);
	}
	return { action: "apply", protocol, reason: `Orca detected (ORCA_IMAGE_PROTOCOL=${advertised})` };
}

import type { Decision } from "./detect.ts";
import type { Shim } from "./shim.ts";

export interface StatusInput {
	decision: Decision;
	images: string | null | undefined;
	shim: Pick<Shim, "renderPatched" | "focusPatched" | "recoveries"> | undefined;
	orcaVersion: string | undefined;
}

export function formatStatus({ decision, images, shim, orcaVersion }: StatusInput): string {
	const action = decision.action === "apply" ? `apply ${decision.protocol}` : decision.action;
	const repaint = shim
		? `repaint fix: ${shim.renderPatched ? "on" : "unavailable"}, focus recovery: ${
				shim.focusPatched ? `on (recoveries: ${shim.recoveries})` : "unavailable"
			}`
		: "repaint fix: off";
	return [
		"pi-orca-images",
		`  decision: ${action}: ${decision.reason}`,
		`  Pi image protocol: ${images ?? "none"}`,
		`  ${repaint}`,
		`  Orca: ${orcaVersion ?? "not detected"}`,
	].join("\n");
}

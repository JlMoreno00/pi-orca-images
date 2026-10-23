import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, getCapabilities, Image, resetCapabilitiesCache, Text } from "@earendil-works/pi-tui";
import { completeSubcommand, SUBCOMMANDS } from "./commands.ts";
import { decide, type Decision, labelsEnabled, OWNED_ENV } from "./detect.ts";
import { type EditorWatcher, watchEditors } from "./labels.ts";
import { installShim, type Shim, type ShimTarget } from "./shim.ts";
import { formatStatus } from "./status.ts";
import { testImagePng } from "./test-image.ts";

const COMMAND = "orca-images";
const TEST_ENTRY = "pi-orca-images:test";
const WIDGET = "pi-orca-images:probe";
const USAGE = `Usage: /${COMMAND} [${SUBCOMMANDS.join("|")}]`;

/** Apply the decision to the process environment, before Pi reads its capabilities. */
function applyDecision(decision: Decision, env = process.env): void {
	if (decision.action === "apply") {
		env.PI_IMAGE_PROTOCOL = decision.protocol;
		env[OWNED_ENV] = decision.protocol;
	} else if (decision.action === "clear-inherited") {
		delete env.PI_IMAGE_PROTOCOL;
		delete env[OWNED_ENV];
	} else {
		return;
	}
	resetCapabilitiesCache();
}

export default function piOrcaImages(pi: ExtensionAPI) {
	const decision = decide(process.env);
	applyDecision(decision);
	const labels = labelsEnabled(process.env);
	let shim: Shim | undefined;
	let watcher: EditorWatcher | undefined;

	pi.on("session_start", async (_event, ctx) => {
		const repaint = decision.action === "apply" && decision.protocol === "kitty";
		if (!ctx.hasUI || (!repaint && !labels)) return;
		// The widget factory is the only public hook that hands an extension the TUI instance.
		ctx.ui.setWidget(WIDGET, (tui) => {
			if (repaint) {
				shim = installShim(tui as unknown as ShimTarget);
				// Resend whatever Pi drew before the fix was in place (first startup render, or a
				// session switch on a Pi that calls this factory late). Deferred: Pi may call the
				// factory while it renders.
				const installed = shim;
				setTimeout(() => installed.recover(), 0);
			}
			if (labels) {
				watcher = watchEditors(tui as unknown as ShimTarget, {
					style: (label) => ctx.ui.theme.fg("accent", ctx.ui.theme.bold(label)),
				});
			}
			return { render: () => [], invalidate() {} };
		});
		ctx.ui.setWidget(WIDGET, undefined);
	});

	pi.on("session_shutdown", async (event) => {
		// The watcher styles labels through this session's ctx, which goes stale on replacement.
		watcher?.uninstall();
		watcher = undefined;
		// On /resume, /new, /fork and /reload Pi draws the next transcript before session_start,
		// so the repaint fix must stay in place; the next session reuses it (installShim is
		// idempotent per TUI). Only quitting removes it.
		if (event.reason === "quit") shim?.uninstall();
		shim = undefined;
	});

	pi.registerEntryRenderer<{ width: number; height: number }>(TEST_ENTRY, (entry, _options, theme) => {
		const { width = 240, height = 120 } = entry.data ?? {};
		const box = new Container();
		box.addChild(new Text(theme.fg("muted", `pi-orca-images test image (${width}x${height})`), 0, 0));
		box.addChild(
			new Image(testImagePng(width, height), "image/png", { fallbackColor: (s: string) => theme.fg("warning", s) }, {
				maxWidthCells: 30,
			}),
		);
		return box;
	});

	pi.registerCommand(COMMAND, {
		description: "Inline images in Orca: status, test, or redraw",
		getArgumentCompletions: completeSubcommand,
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim() || "status";
			if (sub === "status") {
				ctx.ui.notify(
					formatStatus({
						decision,
						images: getCapabilities().images,
						shim,
						orcaVersion: process.env.ORCA_APP_VERSION ?? process.env.TERM_PROGRAM_VERSION,
						labels: labels && watcher !== undefined,
					}),
					"info",
				);
			} else if (sub === "test") {
				pi.appendEntry(TEST_ENTRY, { width: 240, height: 120 });
			} else if (sub === "redraw") {
				if (shim) shim.recover();
				else ctx.ui.notify("pi-orca-images is not active in this terminal; nothing to redraw.", "warning");
			} else {
				ctx.ui.notify(USAGE, "warning");
			}
		},
	});
}

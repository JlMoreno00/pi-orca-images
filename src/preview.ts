import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Image, truncateToWidth } from "@earendil-works/pi-tui";

const run = promisify(execFile);
const EXTENSIONS: Record<string, string> = {
	"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
	"image/webp": "webp", "image/bmp": "bmp", "image/tiff": "tiff",
	"image/avif": "avif", "image/heic": "heic",
};

let previewDirectory: string | undefined;

/** Orca only opens files within the workspace; retain copies across /reload. */
export function savePreview(data: string, mimeType: string): string {
	const extension = EXTENSIONS[mimeType];
	if (!extension) throw new Error(`Unsupported preview format: ${mimeType}`);
	if (!previewDirectory) {
		const root = join(process.cwd(), ".pi", "image-previews");
		mkdirSync(root, { recursive: true, mode: 0o700 });
		writeFileSync(join(root, ".gitignore"), "*\n");
		previewDirectory = mkdtempSync(join(root, "session-"));
	}
	const directory = previewDirectory;
	const bytes = Buffer.from(data, "base64");
	const path = join(directory, `${createHash("sha256").update(bytes).digest("hex")}.${extension}`);
	writeFileSync(path, bytes, { mode: 0o600 });
	return path;
}

export async function openInOrca(path: string): Promise<void> {
	const executable = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? "orca-dev" : "orca");
	await run(executable, ["file", "open", path, "--focus", "--json"], { timeout: 10_000 });
}

const PREVIEW = Symbol.for("pi-orca-images.preview");
type PreviewHost = typeof Image.prototype & { [PREVIEW]?: { uninstall(): void } };

export function installPreviews(options: {
	open?: (path: string) => Promise<void>;
	save?: (data: string, mimeType: string) => string;
	onError: (message: string) => void;
}) {
	const prototype = Image.prototype as PreviewHost;
	prototype[PREVIEW]?.uninstall();
	const originalRender = prototype.render;
	const paths = new WeakMap<Image, string | null>();
	let latest: string | undefined;
	let active = true;
	const open = async (path: string) => {
		try {
			await (options.open ?? openInOrca)(path);
		} catch (error) {
			if (active) options.onError(`Could not open image in Orca: ${error instanceof Error ? error.message : String(error)}`);
		}
	};
	prototype.render = function (width) {
		const lines = originalRender.call(this, width);
		if (!active) return lines;
		if (!paths.has(this)) {
			// Pi exposes no image-data accessor; fail closed if its internal fields change.
			const source = this as unknown as { base64Data?: string; mimeType?: string };
			try {
				paths.set(this, typeof source.base64Data === "string" && typeof source.mimeType === "string"
					? (options.save ?? savePreview)(source.base64Data, source.mimeType) : null);
			} catch {
				paths.set(this, null);
			}
		}
		const path = paths.get(this);
		if (!path) return lines;
		latest = path;
		const label = truncateToWidth("Open image", width);
		return [...lines, `\x1b]8;;${pathToFileURL(path).href}\x07\x1b[4m${label}\x1b[24m\x1b]8;;\x07`];
	};
	const preview = {
		async openLatest() {
			if (latest) await open(latest);
			else options.onError("No image has been rendered yet. Try /orca-images test first.");
		},
		uninstall() {
			if (!active) return;
			active = false;
			prototype.render = originalRender;
			if (prototype[PREVIEW] === preview) delete prototype[PREVIEW];
		},
	};
	prototype[PREVIEW] = preview;
	return preview;
}

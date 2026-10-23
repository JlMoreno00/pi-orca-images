import { statSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif)$/i;

export interface ParsedImagePaths {
	leading: string;
	trailing: string;
	paths: string[];
}

export function isExistingFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/** Split on unquoted, unescaped whitespace; quotes and backslash escapes are removed. */
function tokenize(text: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: string | undefined;
	let inToken = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (quote) {
			if (ch === quote) quote = undefined;
			else current += ch;
		} else if (ch === "\\" && i + 1 < text.length) {
			current += text[++i];
			inToken = true;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			inToken = true;
		} else if (/\s/.test(ch)) {
			if (inToken) tokens.push(current);
			current = "";
			inToken = false;
		} else {
			current += ch;
			inToken = true;
		}
	}
	if (inToken) tokens.push(current);
	return tokens;
}

function toPath(token: string): string | undefined {
	if (token.startsWith("file://")) {
		try {
			return fileURLToPath(token);
		} catch {
			return undefined;
		}
	}
	if (token === "~" || token.startsWith("~/")) return homedir() + token.slice(1);
	return token;
}

/**
 * Recognize text that consists only of image file paths, as pasted or dropped into a terminal.
 * Returns null when any token is not an existing image file, so mixed text is never rewritten.
 */
export function parseImagePaths(
	text: string,
	isImageFile: (path: string) => boolean = isExistingFile,
): ParsedImagePaths | null {
	const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
	const body = match?.[2] ?? "";
	if (!body) return null;
	const paths: string[] = [];
	for (const token of tokenize(body)) {
		const path = toPath(token);
		if (!path || !IMAGE_EXTENSION.test(path) || !isImageFile(path)) return null;
		paths.push(path);
	}
	return paths.length > 0 ? { leading: match?.[1] ?? "", trailing: match?.[3] ?? "", paths } : null;
}

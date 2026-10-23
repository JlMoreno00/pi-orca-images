import assert from "node:assert/strict";
import { homedir } from "node:os";
import { describe, it } from "node:test";
import { parseImagePaths } from "../src/image-paths.ts";

const files = new Set([
	"/tmp/a.png",
	"/tmp/b.JPG",
	"/tmp/with space.webp",
	`${homedir()}/shot.gif`,
	"/tmp/notes.txt",
]);
const exists = (path: string) => files.has(path);

describe("parseImagePaths", () => {
	it("parses one absolute image path and keeps surrounding whitespace", () => {
		assert.deepEqual(parseImagePaths(" /tmp/a.png\n", exists), { leading: " ", trailing: "\n", paths: ["/tmp/a.png"] });
	});

	it("matches extensions case-insensitively", () => {
		assert.deepEqual(parseImagePaths("/tmp/b.JPG", exists)?.paths, ["/tmp/b.JPG"]);
	});

	it("parses several paths separated by spaces or newlines", () => {
		assert.deepEqual(parseImagePaths("/tmp/a.png /tmp/b.JPG\n/tmp/a.png", exists)?.paths, [
			"/tmp/a.png",
			"/tmp/b.JPG",
			"/tmp/a.png",
		]);
	});

	it("unescapes backslash-escaped spaces (terminal drag and drop)", () => {
		assert.deepEqual(parseImagePaths("/tmp/with\\ space.webp", exists)?.paths, ["/tmp/with space.webp"]);
	});

	it("accepts single and double quotes", () => {
		assert.deepEqual(parseImagePaths("'/tmp/with space.webp' \"/tmp/a.png\"", exists)?.paths, [
			"/tmp/with space.webp",
			"/tmp/a.png",
		]);
	});

	it("accepts file:// URLs", () => {
		assert.deepEqual(parseImagePaths("file:///tmp/with%20space.webp", exists)?.paths, ["/tmp/with space.webp"]);
	});

	it("expands ~/", () => {
		assert.deepEqual(parseImagePaths("~/shot.gif", exists)?.paths, [`${homedir()}/shot.gif`]);
	});

	for (const text of ["", "   ", "hello", "/tmp/missing.png", "/tmp/notes.txt", "see /tmp/a.png", "/tmp/a.png and"]) {
		it(`returns null for ${JSON.stringify(text)}`, () => {
			assert.equal(parseImagePaths(text, exists), null);
		});
	}
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { Container, Image } from "@earendil-works/pi-tui";
import { installPreviews, savePreview } from "../src/preview.ts";
import { testImagePng } from "../src/test-image.ts";

it("adds a link once, opens latest, and restores Image", async () => {
	const original = Image.prototype.render;
	const opened: string[] = [];
	let saves = 0;
	const previews = installPreviews({
		save: () => { saves++; return "/tmp/image with space.png"; },
		open: async (path) => { opened.push(path); },
		onError: (message) => assert.fail(message),
	});
	try {
		const image = new Image(testImagePng(10, 10), "image/png", { fallbackColor: (s) => s });
		const container = new Container();
		container.addChild(image);
		assert.match(container.render(40).at(-1)!, /file:\/\/\/tmp\/image%20with%20space.png/);
		container.render(40);
		assert.equal(saves, 1);
		await previews.openLatest();
		assert.deepEqual(opened, ["/tmp/image with space.png"]);
	} finally {
		previews.uninstall();
	}
	assert.equal(Image.prototype.render, original);
});

it("reports open failures and leaves images usable when saving fails", async () => {
	const errors: string[] = [];
	let previews = installPreviews({ save: () => { throw new Error("disk full"); }, onError: (s) => errors.push(s) });
	try {
		const image = new Image(testImagePng(10, 10), "image/png", { fallbackColor: (s) => s });
		assert.ok(!image.render(40).join("").includes("Open image"));
		await previews.openLatest();
		assert.match(errors[0]!, /No image/);
	} finally { previews.uninstall(); }
	previews = installPreviews({
		save: () => "/tmp/image.png",
		open: async () => { throw new Error("Orca unavailable"); },
		onError: (s) => errors.push(s),
	});
	try {
		new Image(testImagePng(10, 10), "image/png", { fallbackColor: (s) => s }).render(40);
		await previews.openLatest();
		assert.match(errors.at(-1)!, /Orca unavailable/);
	} finally { previews.uninstall(); }
});

it("saves the original image bytes and rejects unsupported formats", () => {
	const data = testImagePng(10, 10);
	const path = savePreview(data, "image/png");
	assert.deepEqual(readFileSync(path), Buffer.from(data, "base64"));
	assert.equal(savePreview(data, "image/png"), path);
	assert.throws(() => savePreview(data, "image/svg+xml"), /Unsupported/);
});

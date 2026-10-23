import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { formatStatus } from "../src/status.ts";
import { testImagePng } from "../src/test-image.ts";

describe("formatStatus", () => {
	it("lists the decision, capability, shim, and Orca version", () => {
		assert.equal(
			formatStatus({
				decision: { action: "apply", protocol: "kitty", reason: "Orca detected (ORCA_IMAGE_PROTOCOL=kitty)" },
				images: "kitty",
				shim: { renderPatched: true, focusPatched: true, recoveries: 3 },
				orcaVersion: "1.4.229",
				labels: true,
			}),
			[
				"pi-orca-images",
				"  decision: apply kitty: Orca detected (ORCA_IMAGE_PROTOCOL=kitty)",
				"  Pi image protocol: kitty",
				"  repaint fix: on, focus recovery: on (recoveries: 3)",
				"  image labels: on",
				"  Orca: 1.4.229",
			].join("\n"),
		);
	});

	it("explains when images stay off", () => {
		assert.equal(
			formatStatus({
				decision: { action: "skip", reason: "not running inside Orca" },
				images: null,
				shim: undefined,
				orcaVersion: undefined,
				labels: false,
			}),
			[
				"pi-orca-images",
				"  decision: skip: not running inside Orca",
				"  Pi image protocol: none",
				"  repaint fix: off",
				"  image labels: off (PI_IMAGE_LABELS)",
				"  Orca: not detected",
			].join("\n"),
		);
	});
});

describe("testImagePng", () => {
	it("is a valid RGB PNG of the requested size", () => {
		const png = Buffer.from(testImagePng(40, 24), "base64");
		assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		assert.equal(png.readUInt32BE(16), 40);
		assert.equal(png.readUInt32BE(20), 24);
		const idatLength = png.readUInt32BE(33);
		const raw = inflateSync(png.subarray(41, 41 + idatLength));
		assert.equal(raw.length, 24 * (1 + 40 * 3));
	});
});

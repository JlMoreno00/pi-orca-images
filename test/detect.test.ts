import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decide, labelsEnabled, OWNED_ENV } from "../src/detect.ts";

const orca = { TERM_PROGRAM: "Orca", ORCA_IMAGE_PROTOCOL: "kitty" };

describe("decide", () => {
	it("applies kitty inside Orca when nothing else is configured", () => {
		assert.deepEqual(decide({ ...orca }), {
			action: "apply",
			protocol: "kitty",
			reason: "Orca detected (ORCA_IMAGE_PROTOCOL=kitty)",
		});
	});

	it("passes through iterm2 when Orca advertises it", () => {
		assert.deepEqual(decide({ ...orca, ORCA_IMAGE_PROTOCOL: "iTerm2" }), {
			action: "apply",
			protocol: "iterm2",
			reason: "Orca detected (ORCA_IMAGE_PROTOCOL=iTerm2)",
		});
	});

	it("skips outside Orca", () => {
		assert.deepEqual(decide({ TERM_PROGRAM: "ghostty" }), { action: "skip", reason: "not running inside Orca" });
	});

	it("skips an Orca build that does not advertise inline images", () => {
		assert.deepEqual(decide({ TERM_PROGRAM: "Orca" }), {
			action: "skip",
			reason: "Orca does not advertise inline images (ORCA_IMAGE_PROTOCOL is unset); update Orca",
		});
	});

	it("skips an advertised protocol Pi cannot draw", () => {
		assert.deepEqual(decide({ ...orca, ORCA_IMAGE_PROTOCOL: "sixel" }), {
			action: "skip",
			reason: "Orca advertises ORCA_IMAGE_PROTOCOL=sixel, which Pi cannot draw",
		});
	});

	it("respects a protocol the user set", () => {
		assert.deepEqual(decide({ ...orca, PI_IMAGE_PROTOCOL: "none" }), {
			action: "skip",
			reason: "PI_IMAGE_PROTOCOL=none is set explicitly",
		});
	});

	it("re-applies over its own earlier value (for /reload and child Pi processes)", () => {
		assert.equal(decide({ ...orca, PI_IMAGE_PROTOCOL: "kitty", [OWNED_ENV]: "kitty" }).action, "apply");
	});

	for (const value of ["0", "false", "off"]) {
		it(`is disabled by PI_ORCA_IMAGES=${value}`, () => {
			assert.deepEqual(decide({ ...orca, PI_ORCA_IMAGES: value }), {
				action: "skip",
				reason: "disabled by PI_ORCA_IMAGES",
			});
		});
	}

	it("clears an inherited value when disabled", () => {
		assert.equal(
			decide({ ...orca, PI_ORCA_IMAGES: "0", PI_IMAGE_PROTOCOL: "kitty", [OWNED_ENV]: "kitty" }).action,
			"clear-inherited",
		);
	});

	for (const env of [{ TMUX: "/tmp/tmux-1/default,1,0" }, { TERM: "tmux-256color" }, { TERM: "screen" }]) {
		it(`skips inside a multiplexer (${JSON.stringify(env)})`, () => {
			assert.deepEqual(decide({ ...orca, ...env }), {
				action: "skip",
				reason: "inside tmux or screen; image escapes do not reach Orca",
			});
		});
	}

	it("clears an inherited value inside a multiplexer", () => {
		assert.equal(
			decide({ ...orca, TMUX: "x", PI_IMAGE_PROTOCOL: "kitty", [OWNED_ENV]: "kitty" }).action,
			"clear-inherited",
		);
	});

	it("clears an inherited value outside Orca", () => {
		assert.equal(decide({ PI_IMAGE_PROTOCOL: "kitty", [OWNED_ENV]: "kitty" }).action, "clear-inherited");
	});
});

describe("labelsEnabled", () => {
	it("is on by default, in any terminal", () => {
		assert.equal(labelsEnabled({}), true);
		assert.equal(labelsEnabled({ TERM_PROGRAM: "ghostty" }), true);
	});

	for (const value of ["0", "false", "off", "no"]) {
		it(`is off with PI_IMAGE_LABELS=${value}`, () => {
			assert.equal(labelsEnabled({ PI_IMAGE_LABELS: value }), false);
		});
	}
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeSubcommand } from "../src/commands.ts";

describe("completeSubcommand", () => {
	it("offers every subcommand for an empty prefix", () => {
		assert.deepEqual(completeSubcommand(""), [
			{ value: "status", label: "status" },
			{ value: "test", label: "test" },
			{ value: "redraw", label: "redraw" },
		]);
	});

	it("filters by prefix", () => {
		assert.deepEqual(completeSubcommand("re"), [{ value: "redraw", label: "redraw" }]);
	});

	it("offers nothing for a complete subcommand, so Enter runs it", () => {
		assert.equal(completeSubcommand("test"), null);
		assert.equal(completeSubcommand(" status "), null);
	});

	it("offers nothing for an unknown argument", () => {
		assert.equal(completeSubcommand("x"), null);
	});
});

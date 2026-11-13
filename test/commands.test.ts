import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeSubcommand, parseCommand } from "../src/commands.ts";

describe("completeSubcommand", () => {
	it("offers every subcommand for an empty prefix", () => {
		assert.deepEqual(completeSubcommand(""), [
			{ value: "status", label: "status" },
			{ value: "test", label: "test" },
			{ value: "redraw", label: "redraw" },
			{ value: "open", label: "open" },
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

describe("parseCommand", () => {
	it("defaults to status", () => {
		assert.deepEqual(parseCommand(""), { sub: "status" });
		assert.deepEqual(parseCommand(undefined), { sub: "status" });
	});

	it("keeps plain subcommands unchanged", () => {
		assert.deepEqual(parseCommand(" open "), { sub: "open" });
		assert.deepEqual(parseCommand("redraw"), { sub: "redraw" });
	});

	it("reads an image number after open", () => {
		assert.deepEqual(parseCommand("open 2"), { sub: "open", image: 2 });
		assert.deepEqual(parseCommand("open   12"), { sub: "open", image: 12 });
	});

	it("rejects anything else", () => {
		assert.deepEqual(parseCommand("open 0"), { sub: "invalid" });
		assert.deepEqual(parseCommand("open x"), { sub: "invalid" });
		assert.deepEqual(parseCommand("open 1 2"), { sub: "invalid" });
		assert.deepEqual(parseCommand("status 1"), { sub: "invalid" });
		assert.deepEqual(parseCommand("nope"), { sub: "invalid" });
	});
});

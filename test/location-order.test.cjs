/** Verifies natural, deterministic ordering for displayed Location names. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { sortLocationsByName } = require("../public/location-order.js");

test("Location names sort case-insensitively with natural numeric order", () => {
	const input = [
		{ id:"z", name:"Zulu" },
		{ id:"p10", name:"port 10" },
		{ id:"b", name:"bravo" },
		{ id:"p2", name:"Port 2" },
		{ id:"a", name:"ALPHA" },
	];

	assert.deepEqual(sortLocationsByName(input).map((entry) => entry.id), ["a","b","p2","p10","z"]);
	assert.deepEqual(input.map((entry) => entry.id), ["z","p10","b","p2","a"]);
});

test("equivalent displayed names use Location id then stable input order", () => {
	const first = { locationId:"same", name:"Oban", marker:"first" };
	const second = { locationId:"same", name:"Oban", marker:"second" };
	const input = [
		{ locationId:"port-b", name:"oban" },
		second,
		{ locationId:"port-a", name:"OBAN" },
		first,
	];

	assert.deepEqual(sortLocationsByName(input).map((entry) => entry.locationId), ["port-a","port-b","same","same"]);
	assert.deepEqual(sortLocationsByName(input).filter((entry) => entry.locationId === "same").map((entry) => entry.marker), ["second","first"]);
});

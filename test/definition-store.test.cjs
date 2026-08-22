/** Verifies safe package migrations of durable tidal definitions. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { CONTRACT, mergeBundledDefinitions } = require("../plugin/definition-store.cjs");

function catalogue(ports) { return { contract:CONTRACT,ports,areas:[],gates:[] }; }

test("bundled safety policy is added without replacing user-edited corrections", () => {
	const existingCorrection={ timeOffsetPeriodMinutes:720,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:7 }],lowWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:8 }],heightDifferencesM:{ mhws:1,mhwn:1,mlwn:1,mlws:1 } };
	const stored=catalogue([
		{ locationId:"parent",name:"Parent",kind:"standard",prediction:{ mode:"provider",providerId:"test",stationId:"parent" } },
		{ locationId:"entered",name:"Entered",kind:"secondary",prediction:{ mode:"corrections",parentLocationId:"parent",corrections:existingCorrection } },
	]);
	const bundled=catalogue([
		stored.ports[0],
		{ ...stored.ports[1],automaticPreferredPortLocationId:"direct",advisory:{ status:"caution",message:"Review" },prediction:{ ...stored.ports[1].prediction,corrections:{ ...existingCorrection,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:99 }] } } },
		{ locationId:"direct",name:"Direct",kind:"secondary",prediction:{ mode:"provider",providerId:"test",stationId:"direct" } },
	]);
	const merged=mergeBundledDefinitions(stored,bundled);
	const enteredResult=merged.ports.find((entry)=>entry.locationId==="entered");
	assert.equal(enteredResult.prediction.corrections.highWaterTimeOffsets[0].offsetMinutes,7);
	assert.equal(enteredResult.automaticPreferredPortLocationId,"direct");
	assert.equal(enteredResult.advisory.status,"caution");
	assert.ok(merged.ports.some((entry)=>entry.locationId==="direct"));
});

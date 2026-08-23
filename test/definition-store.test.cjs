/** Verifies safe package migrations of durable tidal definitions. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CONTRACT, createDefinitionStore, mergeBundledDefinitions } = require("../plugin/definition-store.cjs");

function catalogue(ports, overrides={}) { return { contract:CONTRACT,ports,areas:[],gates:[],...overrides }; }

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

test("one-time gate import replaces incompatible records and preserves later edits", () => {
	const port={ locationId:"parent",name:"Parent",kind:"standard",prediction:{ mode:"provider",providerId:"test",stationId:"parent" } };
	const stored=catalogue([port],{
		areas:[{ locationId:"area",name:"Area",portLocationId:"parent" }],
		gates:[{ locationId:"gate-1",contract:"ajrm-tidal-gate-constants-v2",source:"old" }],
		gateTombstones:[{ locationId:"gate-2" },{ locationId:"unrelated" }],
	});
	const bundled=catalogue([port],{
		gateCatalogueImport:"AJRM-Tidal-Gates-v0.6.1-v1",
		gates:[
			{ locationId:"gate-1",contract:"ajrm-tidal-gate-constants-v1",source:"spreadsheet" },
			{ locationId:"gate-2",contract:"ajrm-tidal-gate-constants-v1",source:"spreadsheet" },
		],
	});
	const first=mergeBundledDefinitions(stored,bundled);
	assert.deepEqual(first.gates,bundled.gates);
	assert.deepEqual(first.areas,stored.areas);
	assert.deepEqual(first.gateTombstones,[{ locationId:"unrelated" }]);
	assert.equal(first.gateCatalogueImport,bundled.gateCatalogueImport);

	first.gates[0].source="user edit";
	const second=mergeBundledDefinitions(first,bundled);
	assert.equal(second.gates[0].source,"user edit");
});

test("durable one-time gate import writes a recoverable pre-migration backup", () => {
	const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ajrm-tidal-gates-"));
	try {
		const filename=path.join(directory,"definitions.json");
		const port={ locationId:"parent",name:"Parent",kind:"standard",prediction:{ mode:"provider",providerId:"test",stationId:"parent" } };
		const stored=catalogue([port],{ gates:[{ locationId:"gate-1",contract:"ajrm-tidal-gate-constants-v2" }] });
		const bundled=catalogue([port],{ gateCatalogueImport:"AJRM-Tidal-Gates-v0.6.1-v1",gates:[{ locationId:"gate-1",contract:"ajrm-tidal-gate-constants-v1" }] });
		fs.writeFileSync(filename,`${JSON.stringify(stored,null,2)}\n`);
		const store=createDefinitionStore(filename,bundled);
		assert.equal(store.read().gates[0].contract,"ajrm-tidal-gate-constants-v1");
		assert.deepEqual(JSON.parse(fs.readFileSync(`${filename}.before-gate-catalogue-import.backup`,"utf8")),stored);
	}
	finally { fs.rmSync(directory,{ recursive:true,force:true }); }
});

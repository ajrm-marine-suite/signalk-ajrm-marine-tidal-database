/** Verifies explicit versus automatic tidal-port selection policy. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { recommendSecondary, selectPort } = require("../plugin/spatial-selection.cjs");

const entered = { locationId:"entered", name:"Entered port", kind:"secondary", automaticPreferredPortLocationId:"direct", prediction:{ mode:"corrections", parentLocationId:"parent", corrections:{} } };
const direct = { locationId:"direct", name:"Direct station", kind:"secondary", prediction:{ mode:"provider", providerId:"test", stationId:"one" } };
const parent = { locationId:"parent", name:"Parent", kind:"standard", prediction:{ mode:"provider", providerId:"test", stationId:"parent" } };
const definitions = {
	ports:[entered,direct,parent],
	areas:[
		{ locationId:"broad", name:"Broad", portLocationId:"parent" },
		{ locationId:"small", name:"Small", portLocationId:"entered", parentAreaLocationId:"broad" },
	],
};
const locations = [
	{ id:"broad", feature:{ geometry:{ type:"Polygon", coordinates:[[[-2,49],[2,49],[2,52],[-2,52],[-2,49]]] } } },
	{ id:"small", feature:{ geometry:{ type:"Polygon", coordinates:[[[-1,50],[1,50],[1,51],[-1,51],[-1,50]]] } } },
	{ id:"entered", feature:{ geometry:{ type:"Point", coordinates:[0,50.5] } } },
	{ id:"direct", feature:{ geometry:{ type:"Point", coordinates:[0.01,50.5] } } },
	{ id:"parent", feature:{ geometry:{ type:"Point", coordinates:[0,50] } } },
];

test("automatic area selection prefers the matching direct provider station", () => {
	const result = selectPort(definitions, locations, { position:{ latitude:50.5, longitude:0 } });
	assert.equal(result.port.locationId,"direct");
	assert.equal(result.reason,"preferred-direct-provider");
	assert.deepEqual(result.automaticPreference,{ id:"entered",name:"Entered port" });
});

test("an explicit skipper selection retains the entered correction definition", () => {
	const result = selectPort(definitions, locations, { portId:"entered", position:{ latitude:50.5,longitude:0 } });
	assert.equal(result.port.locationId,"entered");
	assert.equal(result.reason,"selected");
});

test("regional recommendation applies the same direct-provider preference", () => {
	const result = recommendSecondary(definitions, locations, { latitude:50.5,longitude:0 });
	assert.equal(result.port.locationId,"direct");
	assert.equal(result.reason,"preferredDirectProviderInTidalRegion");
});

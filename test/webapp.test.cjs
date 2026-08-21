/** Guards the operator-facing database table and safe update controls. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("webapp explains the refresh floor and exposes both station and port tables", () => {
	const html = fs.readFileSync(path.join(__dirname,"..","public","index.html"),"utf8");
	const app = fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
	assert.match(html, /Provider stations/);
	assert.match(html, /Tidal ports/);
	assert.match(html, /more than 24 hours old/);
	assert.match(app, /button\.disabled = true/);
	assert.match(app, /credentials:"include"/);
	assert.match(html, /id="absoluteReferenceFields"[\s\S]*Standard-port datum and reference levels/);
	assert.match(app, /absoluteReferenceFields"\)\.hidden = secondary/);
	assert.match(app, /definition\.datum = null;[\s\S]*definition\.referenceLevels = null/);
	assert.match(app, /definitionKind"\)\.addEventListener\("change", updateDefinitionFields\)/);
});

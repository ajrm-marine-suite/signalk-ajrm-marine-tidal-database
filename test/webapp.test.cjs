/** Guards the operator-facing database table and safe update controls. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const packageVersion = require("../package.json").version;

test("webapp explains the refresh floor and exposes both station and port tables", () => {
	const html = fs.readFileSync(path.join(__dirname,"..","public","index.html"),"utf8");
	const app = fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
	const styles = fs.readFileSync(path.join(__dirname,"..","public","styles.css"),"utf8");
	assert.match(html, /Provider stations/);
	assert.match(html, /Tidal ports/);
	assert.match(html, /more than 24 hours old/);
	assert.match(app, /button\.disabled = true/);
	assert.match(app, /credentials:"include"/);
	assert.match(html, /id="absoluteReferenceFields"[\s\S]*Standard-port datum and reference levels/);
	assert.match(app, /absoluteReferenceFields"\)\.hidden = secondary/);
	assert.match(app, /definition\.datum = null;[\s\S]*definition\.referenceLevels = null/);
	assert.match(app, /definitionKind"\)\.addEventListener\("change", updateDefinitionFields\)/);
	assert.match(html, /id="definitionLocationReadOnly" hidden/);
	assert.match(html, /class="tide-dialog"/);
	assert.match(html, /id="tideDetailsPane"/);
	assert.match(html, /id="tideGraphPane"/);
	assert.match(app, /class="view-tide"/);
	assert.ok(app.includes(`import("./tide-curve.mjs?v=${packageVersion}")`));
	assert.ok(html.includes(`styles.css?v=${packageVersion}`));
	assert.ok(html.includes(`location-order.js?v=${packageVersion}`));
	assert.ok(html.includes(`app.js?v=${packageVersion}`));
	assert.ok(html.indexOf(`location-order.js?v=${packageVersion}`) < html.indexOf(`app.js?v=${packageVersion}`));
	assert.match(html, /High-only or low-only stations cannot supply current height or a full curve/);
	assert.match(html, /smooth estimate interpolated between UKHO-predicted high- and low-water times and heights/);
	assert.match(app, /tideCurveSvg/);
	assert.match(app, /attachTideCurveHover/);
	assert.match(app, /TIDE_DIALOG_SIZE_KEY/);
	assert.match(app, /saveTideDialogSize/);
	assert.match(styles, /\[hidden\] \{ display:none !important; \}/);
});

test("every user-visible spatial Location collection uses the shared alphabetical ordering", () => {
	const app = fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
	assert.match(app, /sortLocationsByName\(entry\.ports\)/);
	assert.match(app, /sortLocationsByName\(state\.status\.ports\.filter/);
	assert.match(app, /return sortLocationsByName\(values\.filter/);
	assert.match(app, /const locations = sortLocationsByName\(locationsById\.values\(\)\)/);
	assert.match(app, /const standardPorts = sortLocationsByName/);
});

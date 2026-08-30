import fs from 'node:fs';
const p='scripts/indicators/validate-native-api.mjs';
let s=fs.readFileSync(p,'utf8');
const old=`// Compare is a first-class routed, non-ranking product surface. Geo Explorer
// remains the sole visible ranking surface; legacy DOM remains hidden only for
// compatibility with older shell code.
assert(index.includes('<a href="#/compare" data-view-link="compare">Compare</a>'), 'dedicated routed Compare tab is missing from navigation');
assert(index.includes('id="compare" data-view="compare"') && index.includes('class="section compare-hub"'), 'dedicated routed Compare workspace is missing');
assert(index.includes('data-compare-mode="direct"') && index.includes('data-compare-mode="life"'), 'Compare workspace is missing Direct or My Life Elsewhere mode');
assert(index.includes('<script src="assets/compare.js"></script>') && index.includes('<link rel="stylesheet" href="assets/compare.css">'), 'Compare assets are not loaded by index.html');
assert(!index.includes('<a href="#rankings">') && !index.includes('data-view-link="rankings"'), 'retired Rankings link is exposed in main navigation');
assert(/id="compare-legacy" hidden/.test(index), 'legacy Compare compatibility section is not hidden');
assert(/id="rankings" hidden/.test(index), 'legacy Rankings compatibility section is not hidden');`;
const next=`// Compare and the new Results/Rankings workspace are first-class routed
// product surfaces. The retired pre-router ranking DOM remains hidden only for
// compatibility with older shell code; reject only that legacy #rankings link.
assert(index.includes('<a href="#/compare" data-view-link="compare">Compare</a>'), 'dedicated routed Compare tab is missing from navigation');
assert(index.includes('id="compare" data-view="compare"') && index.includes('class="section compare-hub"'), 'dedicated routed Compare workspace is missing');
assert(index.includes('data-compare-mode="direct"') && index.includes('data-compare-mode="life"'), 'Compare workspace is missing Direct or My Life Elsewhere mode');
assert(index.includes('<script src="assets/compare.js"></script>') && index.includes('<link rel="stylesheet" href="assets/compare.css">'), 'Compare assets are not loaded by index.html');
assert(index.includes('<a href="#/rankings" data-view-link="rankings">Rankings</a>'), 'canonical routed Rankings results tab is missing from navigation');
assert(!index.includes('<a href="#rankings">'), 'retired legacy #rankings link is exposed in navigation');
assert(/id="compare-legacy" hidden/.test(index), 'legacy Compare compatibility section is not hidden');
assert(/id="rankings-legacy" hidden/.test(index), 'legacy Rankings compatibility section is not hidden');`;
if(!s.includes(old))throw new Error('Native validator patch target not found');
s=s.replace(old,next).replace('Compare: dedicated routed two-mode surface. Geo Explorer: sole visible ranking surface.','Compare: dedicated routed two-mode surface. Rankings: dedicated routed results surface; legacy ranking DOM remains hidden.');
fs.writeFileSync(p,s);
console.log('NATIVE_RANKINGS_VALIDATOR_PATCHED');

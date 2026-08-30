import fs from 'node:fs';

const file='scripts/distribution/validate-distribution.mjs';
let text=fs.readFileSync(file,'utf8');
const old=`  const p16=roadmap.phases.find(p=>p.id==='P16');\n  assert(p14?.status==='deferred','P14 must be explicitly deferred rather than silently skipped');\n  assert(p15?.status==='complete','P15 must be complete');\n  assert(p16?.status==='next','P16 must be the next v1.0 phase');\n  console.log('P15_ROADMAP_HANDOFF_OK next=P16 deferred=P14');`;
const next=`  const p16=roadmap.phases.find(p=>p.id==='P16');\n  const p17=roadmap.phases.find(p=>p.id==='P17');\n  assert(p14?.status==='deferred','P14 must be explicitly deferred rather than silently skipped');\n  assert(p15?.status==='complete','P15 must be complete');\n  assert(p16?.status==='complete','P16 must remain complete after the release-hardening handoff');\n  assert(p17?.status==='next','P17 must be the next v1.0 phase after P16');\n  console.log('P15_ROADMAP_HANDOFF_OK p16=complete next=P17 deferred=P14');`;
if(!text.includes(old)) throw new Error('P15 roadmap handoff block not found');
text=text.replace(old,next);
fs.writeFileSync(file,text);
console.log('P15_VALIDATOR_HANDOFF_ADVANCED next=P17');

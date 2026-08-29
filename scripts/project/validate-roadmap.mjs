import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(condition,message)=>{if(!condition)throw new Error(`Project roadmap validation: ${message}`);};

try{
  const roadmap=json('data/project-roadmap.json');
  const docs=read('docs/REPO-COMPLETION-PLAN.md');
  assert(roadmap.project==='Kenya Data Atlas','project name must remain Kenya Data Atlas');
  assert(Array.isArray(roadmap.rules)&&roadmap.rules.length>=6,'roadmap must define execution rules');
  assert(Array.isArray(roadmap.phases)&&roadmap.phases.length===18,'roadmap must define exactly P00 through P17');
  const ids=roadmap.phases.map(p=>p.id);
  const expected=Array.from({length:18},(_,i)=>`P${String(i).padStart(2,'0')}`);
  assert(ids.join('|')===expected.join('|'),'phase IDs must be sequential P00 through P17');
  assert(new Set(ids).size===ids.length,'phase IDs must be unique');
  const allowed=new Set(['implemented_pending_release_check','next','planned','complete','blocked']);
  for(const phase of roadmap.phases){
    assert(phase.title&&phase.session_goal,`${phase.id} requires title and session_goal`);
    assert(Array.isArray(phase.outputs)&&phase.outputs.length>=2,`${phase.id} requires concrete outputs`);
    assert(Array.isArray(phase.acceptance)&&phase.acceptance.length>=2,`${phase.id} requires acceptance criteria`);
    assert(Array.isArray(phase.depends_on),`${phase.id} requires a dependency list`);
    assert(allowed.has(phase.status),`${phase.id} has unsupported status ${phase.status}`);
    for(const dependency of phase.depends_on) assert(ids.includes(dependency),`${phase.id} depends on unknown phase ${dependency}`);
  }
  const next=roadmap.phases.filter(p=>p.status==='next');
  assert(next.length===1&&next[0].id==='P05','exactly P05 must be the next phase after P04');
  assert(roadmap.phases[0].status==='complete','P00 must be complete');
  assert(roadmap.phases[1].status==='complete','P01 must be complete');
  assert(roadmap.phases[2].status==='complete','P02 must be complete');
  assert(roadmap.phases[3].status==='complete','P03 must be complete');
  assert(roadmap.phases[4].status==='complete','P04 must be complete');
  for(const token of ['## P00','## P01','## P02','## P03','## P04','## P17','Session completion protocol','Complete P05']) assert(docs.includes(token),`completion plan missing ${token}`);
  console.log('PROJECT_PHASES_P00_P17_OK');
  console.log('PROJECT_P04_COMPLETE_OK');
  console.log('PROJECT_NEXT_PHASE_P05_OK');
  console.log('PROJECT_SESSION_PLAN_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}

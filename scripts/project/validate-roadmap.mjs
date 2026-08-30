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
  const allowed=new Set(['implemented_pending_release_check','next','planned','complete','blocked','deferred']);
  for(const phase of roadmap.phases){
    assert(phase.title&&phase.session_goal,`${phase.id} requires title and session_goal`);
    assert(Array.isArray(phase.outputs)&&phase.outputs.length>=2,`${phase.id} requires concrete outputs`);
    assert(Array.isArray(phase.acceptance)&&phase.acceptance.length>=2,`${phase.id} requires acceptance criteria`);
    assert(Array.isArray(phase.depends_on),`${phase.id} requires a dependency list`);
    assert(allowed.has(phase.status),`${phase.id} has unsupported status ${phase.status}`);
    for(const dependency of phase.depends_on) assert(ids.includes(dependency),`${phase.id} depends on unknown phase ${dependency}`);
  }

  const sectionOf=(id)=>{const heading=new RegExp(`^## ${id} —`,'m');const parts=docs.split(heading);return parts.length>1?parts[1].split('\n---\n')[0]:'';};
  const next=roadmap.phases.filter(p=>p.status==='next');
  assert(next.length<=1,`at most one phase may be marked next, found ${next.length}`);

  if(next.length===1){
    const nextIndex=ids.indexOf(next[0].id);
    for(let i=0;i<nextIndex;i++){
      const prior=roadmap.phases[i];
      assert(['complete','deferred'].includes(prior.status),`${prior.id} must be complete or explicitly deferred before ${next[0].id} can be next`);
      if(prior.status==='deferred') assert(prior.target_release&&prior.defer_reason,`${prior.id} deferred phase requires target_release and defer_reason`);
      const expectedStatus=prior.status==='deferred'?'**Status: deferred.**':'**Status: complete.**';
      assert(sectionOf(prior.id).includes(expectedStatus),`${prior.id} documentation must be marked ${prior.status}`);
    }
    assert(next[0].id==='P17','P17 must be the only remaining next phase at repository closeout');
    assert(sectionOf('P17').includes('**Status: next.**'),'P17 documentation must be marked next before release gates close');
    for(const token of ['## P00','## P01','## P02','## P03','## P04','## P05','## P06','## P17','Session completion protocol','Complete P17']) assert(docs.includes(token),`completion plan missing ${token}`);
    console.log('PROJECT_PHASES_P00_P17_OK');
    console.log('PROJECT_P16_COMPLETE_OK');
    console.log('PROJECT_NEXT_PHASE_P17_OK');
    console.log('PROJECT_SESSION_PLAN_OK');
  } else {
    assert(roadmap.phases.every(p=>p.status==='complete'),'terminal roadmap state requires P00–P17 all complete');
    assert(roadmap.phases.at(-1).id==='P17'&&roadmap.phases.at(-1).status==='complete','P17 must close the terminal roadmap state');
    for(const phase of roadmap.phases) assert(sectionOf(phase.id).includes('**Status: complete.**'),`${phase.id} documentation must be marked complete in terminal state`);
    assert(docs.includes('completed v1.0 release ledger'),'completion plan must identify the terminal v1.0 ledger');
    console.log('PROJECT_PHASES_P00_P17_OK');
    console.log('PROJECT_TERMINAL_STATE_V1_OK');
    console.log('PROJECT_ALL_PHASES_COMPLETE_OK');
  }
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}

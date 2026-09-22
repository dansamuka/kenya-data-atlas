// P37 -- summarize the P36-P42 post-P35 successor roadmap as a counter fully separate from the
// historical P00-P35 36/36 result. That historical count must never be rewritten by this
// programme (docs/POST-P35-CLOSURE-PLAN.md rule: "P00-P35 phase status, completion counts and
// historical acceptance semantics must not be rewritten"), so this summary is additive: it is
// reported alongside status.roadmap, never merged into it.
export function summarizeSuccessorRoadmap(roadmap) {
  const phases = roadmap.phases || [];
  const complete = phases.filter(p => p.status === 'complete');
  // "next" is this roadmap's own convention for the phase queued to start; fall back to the
  // first non-complete phase in ID order if a differently-worded status is ever used instead.
  const current = phases.find(p => p.status === 'next') || phases.find(p => p.status !== 'complete') || null;
  return {
    schema_version: 'kda.status.successor-roadmap-summary.v1',
    programme: roadmap.programme,
    programme_status: roadmap.status,
    total_phases: phases.length,
    complete_phases: complete.length,
    completion_pct: phases.length ? Math.round((complete.length / phases.length) * 10000) / 100 : 0,
    current_phase: current ? { id: current.id, title: current.title, status: current.status } : null,
    phases: phases.map(p => ({ id: p.id, title: p.title, status: p.status }))
  };
}

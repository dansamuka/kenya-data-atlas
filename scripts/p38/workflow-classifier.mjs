// P38 -- classify a GitHub Actions workflow file by its actual trigger shape, not its filename.
// A workflow that can fire on an unconditional (no path filter) push to main is live/ongoing by
// definition, regardless of what phase its name references. A workflow whose every triggering
// path (whether under push or pull_request) references nothing but its own narrow file pair will
// never fire again once the specific task those paths belong to is closed -- some historical
// one-offs carry both a pull_request AND a push trigger, both scoped to the same self-referential
// handful of paths, so trigger *type* alone is not a reliable signal; path *scope* is.
export function extractOnBlock(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const onIndex = lines.findIndex(l => /^on:\s*$/.test(l));
  if (onIndex === -1) return { raw: '', triggers: [] };
  const blockLines = [];
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // next top-level (0-indent) key ends the on: block
    if (line.trim() === '') continue;
    blockLines.push(line);
  }
  const raw = blockLines.join('\n');
  const triggers = [...new Set([...raw.matchAll(/^ {2}([\w-]+):/gm)].map(m => m[1]))];
  return { raw, triggers };
}

function extractTriggerSection(raw, key) {
  // Returns the raw text of one top-level trigger's own sub-block (indentation >= 4 spaces),
  // stopping at the next 2-space-indented sibling key.
  const lines = raw.split('\n');
  const startIndex = lines.findIndex(l => new RegExp(`^ {2}${key}:`).test(l));
  if (startIndex === -1) return '';
  const section = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^ {2}\S/.test(lines[i])) break;
    section.push(lines[i]);
  }
  return section.join('\n');
}

function extractPaths(sectionText) {
  const match = sectionText.match(/paths:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (!match) return null; // null = no path filter present (unconditional trigger)
  return match[1]
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function classifyWorkflow(yamlText, fileName) {
  const { raw, triggers } = extractOnBlock(yamlText);
  const hasSchedule = triggers.includes('schedule');
  if (hasSchedule) {
    return { classification: 'permanent_gate', reason: 'runs on a recurring schedule', triggers };
  }

  const pathTriggers = triggers.filter(t => t === 'push' || t === 'pull_request');
  if (pathTriggers.length === 0) {
    if (triggers.length === 1 && triggers[0] === 'workflow_dispatch') {
      return { classification: 'reusable_manual_tool', reason: 'workflow_dispatch is the only trigger -- a manual tool kept for reuse, not an automatic gate', triggers };
    }
    return { classification: 'needs_manual_review', reason: `trigger shape (${triggers.join(', ') || 'none detected'}) did not match a known pattern`, triggers };
  }

  const stem = fileName.replace(/\.ya?ml$/, '');
  // Some workflows target a data/script file whose own name drops the phase-number prefix (e.g.
  // p23-wajir-west-fresh-source-review.yml -> form34b-wajir-west-fresh-source-review.json) --
  // match on the phase-prefix-stripped stem too, not just the literal filename.
  const bareStem = stem.replace(/^p\d+x?-/, '');
  let anyUnconditional = false;
  const allPaths = new Set();
  for (const key of pathTriggers) {
    const section = extractTriggerSection(raw, key);
    const paths = extractPaths(section);
    if (paths === null) {
      anyUnconditional = true; // push/pull_request with no paths: filter -- fires on any change
    } else {
      for (const p of paths) allPaths.add(p);
    }
  }

  if (anyUnconditional) {
    return { classification: 'permanent_gate', reason: 'has an unconditional push/pull_request trigger with no path filter -- runs on every future mainline change', triggers };
  }

  const paths = [...allPaths];
  const selfReferential = paths.length > 0 && paths.every(p => p.includes(stem) || p.includes(bareStem) || p.includes('.github/workflows/'));
  if (paths.length > 0 && paths.length <= 6 && selfReferential) {
    return {
      classification: 'historical_one_off',
      reason: `every triggering path (${paths.length} total, across ${pathTriggers.join('+')}) references only this workflow's own files -- will not fire again once that narrow task is closed`,
      triggers,
      paths
    };
  }
  return {
    classification: 'shared_gate',
    reason: 'path-scoped trigger(s) covering more than this workflow\'s own files -- an ongoing shared validation gate',
    triggers,
    paths
  };
}

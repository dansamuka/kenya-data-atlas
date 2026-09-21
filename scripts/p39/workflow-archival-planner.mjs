// P39 -- plan the archival edit for one historical_one_off workflow file (pure, no I/O).
// Never touches a file whose live classification isn't historical_one_off at the moment of
// archival -- if someone re-broadened a workflow's paths since the P38 snapshot, this must detect
// that drift and refuse to archive it, not blindly trust the frozen inventory.
import { classifyWorkflow } from '../p38/workflow-classifier.mjs';

export const ARCHIVE_MARKER = '# Archived by P39';

export function planWorkflowArchival(yamlText, fileName, { archivedOn }) {
  if (yamlText.includes(ARCHIVE_MARKER)) {
    return { status: 'already_archived', patchedText: null };
  }

  const classification = classifyWorkflow(yamlText, fileName);
  if (classification.classification !== 'historical_one_off') {
    return {
      status: 'skipped_not_historical_one_off',
      patchedText: null,
      liveClassification: classification.classification
    };
  }

  const lines = yamlText.split(/\r?\n/);
  const onIndex = lines.findIndex(l => /^on:\s*$/.test(l));
  if (onIndex === -1) {
    return { status: 'skipped_no_on_block', patchedText: null };
  }
  let endIndex = lines.length;
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  const banner = [
    `${ARCHIVE_MARKER} (${archivedOn}): originally triggered on ${classification.triggers.join(', ')}, every`,
    '# path scoped only to this workflow\'s own files (P38 classification: historical_one_off). Will not',
    '# fire automatically again; preserved as a governed evidence record and kept available for',
    '# on-demand manual re-run via workflow_dispatch.',
    'on:',
    '  workflow_dispatch:'
  ];
  const newLines = [...lines.slice(0, onIndex), ...banner, ...lines.slice(endIndex)];
  return {
    status: 'archived',
    patchedText: newLines.join('\n'),
    originalTriggers: classification.triggers,
    originalPaths: classification.paths || null
  };
}

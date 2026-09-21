// P39 -- decide the safe action for one P38-authorised branch-deletion candidate against
// freshly-fetched live state (pure, no I/O). A branch is only ever eligible for deletion when its
// live SHA still matches the SHA recorded at P38 classification time AND its disposition
// re-validates live -- any drift (new commits pushed, disposition no longer holding) blocks
// deletion structurally rather than trusting the frozen batch file.
export function reconcileBranchForCleanup(entry, live) {
  if (!live.exists) {
    return { name: entry.name, action: 'already_gone', detail: 'branch no longer exists on the remote' };
  }
  if (live.sha !== entry.sha) {
    return {
      name: entry.name,
      action: 'skipped_drift',
      detail: `live sha ${live.sha} no longer matches the P38-recorded sha ${entry.sha} -- new commits were pushed since classification`
    };
  }
  if (live.dispositionStillValid === false) {
    return {
      name: entry.name,
      action: 'skipped_disposition_changed',
      detail: `disposition ${entry.disposition} no longer re-validates live`
    };
  }
  return { name: entry.name, action: 'eligible_for_deletion', detail: `disposition ${entry.disposition} re-validated live` };
}

export function planBranchCleanup(batchEntries, liveStateByName) {
  return batchEntries.map(entry => reconcileBranchForCleanup(entry, liveStateByName.get(entry.name)));
}

// P38 -- classify a remote branch's disposition from real PR/merge evidence, never a guess.
// The one hard rule this enforces structurally: an open PR, an unresolved (closed-without-merge)
// PR, or a branch with no PR reference and no proof its content is on main are NEVER deletion
// candidates. Only a branch whose content is provably already on main (via a merged PR, or its
// head commit being an ancestor of main) can ever be marked deletion_candidate: true.
export const PROTECTED_NAME_PATTERNS = [/^backup-/i, /^docs\//i];

export function classifyBranch(branch, { openPrsByRef, closedPrsByRef, isAncestorOfMain = null }) {
  for (const pattern of PROTECTED_NAME_PATTERNS) {
    if (pattern.test(branch.name)) {
      return {
        disposition: 'protected_evidence',
        reason: `branch name matches protected-evidence pattern ${pattern}`,
        deletion_candidate: false,
        preservation_reference: null
      };
    }
  }

  const openPr = openPrsByRef.get(branch.name);
  if (openPr) {
    return {
      disposition: 'active_open_pr',
      reason: `open PR #${openPr.number}`,
      deletion_candidate: false,
      preservation_reference: openPr.html_url
    };
  }

  const closedMatches = closedPrsByRef.get(branch.name) || [];
  const merged = closedMatches.find(pr => pr.merged_at);
  if (merged) {
    return {
      disposition: 'merged_via_pr',
      reason: `content merged via PR #${merged.number}`,
      deletion_candidate: true,
      preservation_reference: merged.html_url
    };
  }

  const closedUnmerged = closedMatches[0];
  if (closedUnmerged) {
    return {
      disposition: 'closed_unmerged_pr_needs_review',
      reason: `PR #${closedUnmerged.number} was closed without merging -- may hold abandoned or superseded work`,
      deletion_candidate: false,
      preservation_reference: closedUnmerged.html_url
    };
  }

  if (isAncestorOfMain === true) {
    return {
      disposition: 'merged_no_pr_ancestor_of_main',
      reason: 'head commit is already an ancestor of main (merged without a PR, e.g. fast-forward or direct push)',
      deletion_candidate: true,
      preservation_reference: 'ancestor of main'
    };
  }

  return {
    disposition: 'no_pr_reference_needs_manual_review',
    reason: 'no open or closed PR references this branch, and its head commit is not confirmed as an ancestor of main -- unique content may exist here',
    deletion_candidate: false,
    preservation_reference: null
  };
}

export function selectFirstCleanupBatch(classifiedBranches, { limit = 50 } = {}) {
  const candidates = classifiedBranches.filter(b => b.deletion_candidate === true);
  return candidates.slice(0, limit);
}

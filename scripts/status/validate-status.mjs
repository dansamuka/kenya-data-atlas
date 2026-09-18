#!/usr/bin/env node
import { buildStatus, renderMarkdown, validateStatus } from './build-status.mjs';

try {
  const status = await buildStatus({ includeRemote: false });
  validateStatus(status);
  const markdown = renderMarkdown(status);

  if (!markdown.includes('# KDA — Live Repository Status')) {
    throw new Error('Status markdown did not render the expected dashboard heading.');
  }

  const current = status.roadmap.current_phase?.id || 'none';
  console.log(
    `KDA_STATUS_OK phases=${status.roadmap.total_phases} complete=${status.roadmap.complete_phases} current=${current}`
  );
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exit(1);
}

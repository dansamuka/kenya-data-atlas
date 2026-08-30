import fs from 'node:fs';
const patch=(p,fn)=>{let s=fs.readFileSync(p,'utf8');const n=fn(s);if(n===s)throw new Error(`No change applied to ${p}`);fs.writeFileSync(p,n);};

patch('index.html',s=>s
  .replace('<button type="button" role="tab" aria-selected="false" data-ri-tab="recognition">Recognition</button>','<button type="button" role="tab" aria-selected="false" data-ri-tab="administration">Administration scorecards</button>\n        <button type="button" role="tab" aria-selected="false" data-ri-tab="recognition">Recognition</button>')
  .replace('      <section class="ri-panel" data-ri-panel="recognition" hidden>',`      <section class="ri-panel" data-ri-panel="administration" hidden>
        <div class="ri-panel-head"><div><p class="eyebrow">Administration-period scorecards</p><h2>Baseline-to-latest fiscal change for all 47 counties.</h2><p>Compare the last full pre-election fiscal year with the latest full current-cycle year. The transition year is not used in the baseline-to-latest change.</p></div><span class="ri-count">47 county scorecards</span></div>
        <div class="ri-table-wrap"><table class="ri-table"><thead><tr><th>Current fiscal rank</th><th>County</th><th>Current fiscal score</th><th>Overall absorption change</th><th>Development absorption change</th><th>Comparison period</th></tr></thead><tbody id="ri-administration-body"><tr><td colspan="6">Loading administration scorecards…</td></tr></tbody></table></div>
        <p class="ri-note">These are county administration-period records, not personal governor causal scores. FY2022/23 is treated as a transition/context year rather than the baseline.</p>
      </section>

      <section class="ri-panel" data-ri-panel="recognition" hidden>`));

patch('assets/rankings-insights.js',s=>s
  .replace('  function renderRecognition(d){',`  function renderAdministration(d){
    const body=$('#ri-administration-body');if(!body)return;
    const rows=(d.counties||[]).slice().sort((a,b)=>finite(a.fiscal_delivery?.rank)?(finite(b.fiscal_delivery?.rank)?a.fiscal_delivery.rank-b.fiscal_delivery.rank:-1):(finite(b.fiscal_delivery?.rank)?1:a.name.localeCompare(b.name)));
    body.innerHTML=rows.map(c=>\`<tr class="\${finite(c.administration?.current_fiscal_score)?'':'ri-withheld-row'}">
      <td>\${finite(c.fiscal_delivery?.rank)?\`<strong>#\${esc(c.fiscal_delivery.rank)}</strong>\`:'—'}</td>
      <td><strong>\${esc(c.name)}</strong></td>
      <td><strong>\${finite(c.administration?.current_fiscal_score)?nfmt(c.administration.current_fiscal_score,1):'Not scored'}</strong></td>
      <td>\${signed(c.administration?.overall_absorption_change_pp,' pp')}</td>
      <td>\${signed(c.administration?.development_absorption_change_pp,' pp')}</td>
      <td>\${esc(c.administration?.baseline_fiscal_year||'—')} → \${esc(c.administration?.latest_fiscal_year||'—')}</td>
    </tr>\`).join('');
  }

  function renderRecognition(d){`)
  .replace('renderRecognition(d);bind(d);activate(activeTab,d);','renderAdministration(d);renderRecognition(d);bind(d);activate(activeTab,d);'));

patch('scripts/ui/validate-rankings-insights.mjs',s=>s
  .replace("'Recognition','Official evidence'","'Administration scorecards','Recognition','Official evidence'")
  .replace("for(const token of ['development_snapshot','fiscal_delivery','indicator_rankings','strengths_and_gaps','recognition','evidence'])","for(const token of ['development_snapshot','fiscal_delivery','indicator_rankings','strengths_and_gaps','administration','recognition','evidence'])"));

patch('docs/USER-FACING-RESULTS.md',s=>s.replace('### Administration-period scorecards and recognition','### Administration-period scorecards and recognition\nThe Rankings route includes a full 47-county scorecard table showing current fiscal rank/score plus baseline-to-latest changes in overall and development absorption.'));
console.log('ADMINISTRATION_SCORECARDS_UI_ADDED');

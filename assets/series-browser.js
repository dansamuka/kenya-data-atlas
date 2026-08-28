/* Kenya Data Atlas — lazy dataset/series browser.
 *
 * The Series route already renders any canonical series code. This module adds
 * discovery without creating a parallel data store: published catalogue
 * datasets are joined to active canonical series by dataset_id, then switching
 * either selector navigates to the existing shareable #/series/<series_code>
 * route. It is loaded only when the Series view is requested.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA||!R)return;

  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  let bootPromise=null,data=null;

  function route(){return R.current()||R.parse();}
  function ensureStyle(){
    if(document.querySelector('link[data-kda-series-browser-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='assets/series-browser.css';link.dataset.kdaSeriesBrowserStyle='true';
    document.head.appendChild(link);
  }
  async function loadData(){
    if(data)return data;
    const [series,indicators,geographies,datasets]=await KDA.registries(['series','indicators','geographies','datasets'],{required:true});
    const indicatorById=new Map((indicators||[]).map(x=>[x.indicator_id,x]));
    const geoById=new Map((geographies||[]).map(x=>[x.geography_id,x]));
    const published=(datasets||[]).filter(x=>x.publication_status==='published');
    const datasetById=new Map(published.map(x=>[x.dataset_id,x]));
    const active=(series||[]).filter(x=>(!x.status||x.status==='active')&&datasetById.has(x.dataset_id));
    const seriesByCode=new Map(active.map(x=>[x.series_code,x]));
    const seriesById=new Map(active.map(x=>[x.series_id,x]));
    const seriesByDataset=new Map();
    active.forEach(s=>{if(!seriesByDataset.has(s.dataset_id))seriesByDataset.set(s.dataset_id,[]);seriesByDataset.get(s.dataset_id).push(s);});
    const browsable=published.filter(d=>seriesByDataset.has(d.dataset_id)).sort((a,b)=>String(a.topic||'').localeCompare(String(b.topic||''))||a.title.localeCompare(b.title));
    data={indicatorById,geoById,datasetById,seriesByCode,seriesById,seriesByDataset,datasets:browsable};
    return data;
  }
  function geoRank(level){return {country:0,county:1,constituency:2,ward:3}[level]??9;}
  function bestSeries(rows,d){
    return [...rows].sort((a,b)=>{
      const ga=d.geoById.get(a.geography_id),gb=d.geoById.get(b.geography_id);
      return geoRank(ga?.level)-geoRank(gb?.level)||(Number(b.observation_count)||0)-(Number(a.observation_count)||0)||String(d.indicatorById.get(a.indicator_id)?.name||a.series_code).localeCompare(String(d.indicatorById.get(b.indicator_id)?.name||b.series_code))||a.series_code.localeCompare(b.series_code);
    })[0];
  }
  function labelForSeries(s,d){
    const geo=d.geoById.get(s.geography_id),frequency=String(s.frequency||'').replaceAll('_',' '),count=Number(s.observation_count)||0;
    return `${geo?.name||'Unknown place'} · ${frequency||'unspecified'} · ${count} obs`;
  }
  function currentSeries(r,d){
    const key=decodeURIComponent(r.rest||'KDA-CPI-YOY-KEN');
    return d.seriesByCode.get(key)||d.seriesById.get(key)||null;
  }
  function buildSeriesOptions(rows,d,currentCode){
    const groups=new Map();
    rows.forEach(s=>{const indicator=d.indicatorById.get(s.indicator_id),name=indicator?.name||indicator?.short_name||s.series_code;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(s);});
    return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,items])=>`<optgroup label="${esc(name)}">${items.sort((a,b)=>labelForSeries(a,d).localeCompare(labelForSeries(b,d))).map(s=>`<option value="${esc(s.series_code)}"${s.series_code===currentCode?' selected':''}>${esc(labelForSeries(s,d))}</option>`).join('')}</optgroup>`).join('');
  }
  function shell(root){
    let browser=$('.series-browser',root);if(browser)return browser;
    browser=document.createElement('div');browser.className='series-browser';browser.setAttribute('aria-label','Browse published datasets and series');
    browser.innerHTML=`<div class="series-browser-head"><div><p class="eyebrow">Browse published data</p><h3>Choose a dataset, then a series.</h3></div><p>Every choice below comes from the same canonical catalogue and series registries used by the chart.</p></div><div class="series-dataset-chips" data-series-dataset-chips aria-label="Published datasets"></div><div class="series-browser-grid"><label>Dataset<select data-series-dataset aria-label="Select published dataset"></select></label><label>Series<select data-series-choice aria-label="Select series within dataset"></select></label></div><div class="series-browser-meta" data-series-dataset-meta></div>`;
    root.querySelector('.series-card')?.insertAdjacentElement('beforebegin',browser);
    return browser;
  }
  function renderDatasetMeta(dataset,rows,d,browser){
    const meta=$('[data-series-dataset-meta]',browser);if(!meta)return;
    const levels=[...new Set(rows.map(s=>d.geoById.get(s.geography_id)?.level).filter(Boolean))];
    meta.innerHTML=`<div><strong>${esc(dataset.title)}</strong><span>${esc(dataset.topic||'Data')} · ${rows.length.toLocaleString('en-KE')} active series${levels.length?` · ${esc(levels.join(', '))}`:''}</span></div><p>${esc(dataset.description||'Published Atlas dataset.')}</p>`;
  }
  function sync(r){
    if(r.view!=='series'||!data)return;
    const root=$('#series');if(!root)return;
    const browser=shell(root),s=currentSeries(r,data);
    const fallback=s||bestSeries([...data.seriesByCode.values()],data);if(!fallback)return;
    const dataset=data.datasetById.get(fallback.dataset_id),rows=data.seriesByDataset.get(fallback.dataset_id)||[];
    if(!dataset||!rows.length)return;

    const datasetSelect=$('[data-series-dataset]',browser),seriesSelect=$('[data-series-choice]',browser),chips=$('[data-series-dataset-chips]',browser);
    datasetSelect.innerHTML=data.datasets.map(ds=>{const n=data.seriesByDataset.get(ds.dataset_id)?.length||0;return `<option value="${esc(ds.dataset_id)}"${ds.dataset_id===dataset.dataset_id?' selected':''}>${esc(ds.title)} (${n.toLocaleString('en-KE')})</option>`;}).join('');
    seriesSelect.innerHTML=buildSeriesOptions(rows,data,fallback.series_code);
    chips.innerHTML=data.datasets.map(ds=>`<button type="button" data-series-dataset-chip="${esc(ds.dataset_id)}" class="${ds.dataset_id===dataset.dataset_id?'active':''}" aria-pressed="${ds.dataset_id===dataset.dataset_id?'true':'false'}">${esc(ds.title)}</button>`).join('');
    renderDatasetMeta(dataset,rows,data,browser);

    datasetSelect.onchange=()=>navigateDataset(datasetSelect.value);
    seriesSelect.onchange=()=>R.navigate('series',seriesSelect.value,route().params,{scroll:false});
    chips.onclick=event=>{const btn=event.target.closest('[data-series-dataset-chip]');if(btn)navigateDataset(btn.dataset.seriesDatasetChip);};
  }
  function navigateDataset(datasetId){
    if(!data)return;const rows=data.seriesByDataset.get(datasetId)||[],next=bestSeries(rows,data);if(next)R.navigate('series',next.series_code,route().params,{scroll:false});
  }
  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{ensureStyle();await loadData();sync(route());return data;})().catch(error=>{
      console.warn('Series dataset browser:',error?.message||error);
      const root=$('#series'),card=root?.querySelector('.series-card');
      if(root&&card&&!root.querySelector('.series-browser-error')){const note=document.createElement('p');note.className='source-note series-browser-error';note.textContent='Dataset browser is temporarily unavailable; direct series links still work.';card.insertAdjacentElement('beforebegin',note);}
      return null;
    });
    return bootPromise;
  }

  window.addEventListener('kda:route',event=>{if(event.detail?.view==='series')boot().then(()=>sync(event.detail));});
  window.KDASeriesBrowser={boot,sync:()=>sync(route())};
  if(route().view==='series')boot();
})();

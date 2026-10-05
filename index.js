const MODULE = 'bible-oracle';
const VERSION = '0.5.0';
const KJV_SOURCES = [
  'https://cdn.jsdelivr.net/gh/churchstudio-org/openbible@main/KJV/bible.json',
  'https://raw.githubusercontent.com/churchstudio-org/openbible/main/KJV/bible.json',
  'https://raw.githubusercontent.com/midvash/bible-data/main/versions/en/kjv/kjv.json'
];

const THEMES = [
  'Sin','Repentance','Forgiveness','Pride','Humility','Hypocrisy','Judgment','Wrath','Mercy','Death',
  'Resurrection','Suffering','Fear','Faith','Doubt','Abandonment','Obedience','Rebellion','Sacrifice','Blood',
  'Purity','Uncleanness','Darkness','Light','Fire','Water','Hunger','Thirst','Wilderness','Exile','Betrayal',
  'Persecution','Temptation','Demons','Miracles','Prophecy','Apocalypse','Creation','Vanity','Wisdom','Love',
  'Hatred','Envy','Greed','Justice','Healing','Comfort','Hope','Despair','Foolishness','Life'
];

const THEME_TERMS = {
  Sin:['sin','sins','sinned','iniquity','transgression','wicked','wickedness'],
  Repentance:['repent','repented','repentance','turn','turned'],
  Forgiveness:['forgive','forgiven','forgiveness','mercy','merciful'],
  Pride:['pride','proud','haughty','boast','boasteth','boasting'],
  Humility:['humble','humility','meek','lowly'],
  Hypocrisy:['hypocrite','hypocrites','hypocrisy','pharisee'],
  Judgment:['judge','judgment','judgement','judged','condemn','condemned'],
  Wrath:['wrath','anger','fury','vengeance'],
  Mercy:['mercy','mercies','merciful','compassion'],
  Death:['death','dead','die','died','grave','mortal'],
  Resurrection:['resurrection','risen','raised','raise','quickened'],
  Suffering:['suffer','suffered','suffering','tribulation','affliction','sorrow'],
  Fear:['fear','afraid','terror','tremble'],
  Faith:['faith','believe','believed','trust','trusted'],
  Doubt:['doubt','doubted','doubting','unbelief'],
  Abandonment:['forsaken','forsake','abandoned','alone','desolate'],
  Obedience:['obey','obeyed','obedience','commandment','keep'],
  Rebellion:['rebel','rebellion','rebellious','stubborn'],
  Sacrifice:['sacrifice','offering','altar','lamb'],
  Blood:['blood','bloodshed'],
  Purity:['pure','purity','clean','cleansed','holy','holiness'],
  Uncleanness:['unclean','uncleanness','defiled','defile'],
  Darkness:['darkness','dark','night','shadow'],
  Light:['light','lighten','brightness','shine'],
  Fire:['fire','flame','burn','burned','burneth'],
  Water:['water','river','sea','flood'],
  Hunger:['hunger','hungry','bread','famine'],
  Thirst:['thirst','thirsty','drink'],
  Wilderness:['wilderness','desert','waste'],
  Exile:['captivity','captive','exile','stranger','sojourn'],
  Betrayal:['betray','betrayed','betrayal','traitor'],
  Persecution:['persecute','persecution','persecuted','oppressed'],
  Temptation:['tempt','temptation','tempted','trial'],
  Demons:['devil','devils','demon','demons','unclean spirit'],
  Miracles:['miracle','miracles','wonders','signs'],
  Prophecy:['prophet','prophecy','prophesy','vision','oracle'],
  Apocalypse:['revelation','apocalypse','wrath','plague','judgment','end of the world'],
  Creation:['create','created','creation','beginning','earth'],
  Vanity:['vanity','vanities','foolish','foolishness'],
  Wisdom:['wisdom','wise','understanding','knowledge'],
  Love:['love','loveth','beloved','charity'],
  Hatred:['hate','hateth','hatred','enemy','enemies'],
  Envy:['envy','envious','jealous','jealousy'],
  Greed:['greed','covet','covetous','mammon','riches'],
  Justice:['justice','just','righteous','righteousness','judgment'],
  Healing:['heal','healed','healing','whole','physician'],
  Comfort:['comfort','comforted','consolation','rest'],
  Hope:['hope','hoped','wait','promise'],
  Despair:['despair','desperate','troubled','anguish'],
  Foolishness:['fool','fools','foolish','folly'],
  Life:['life','living','live','liveth']
};

const state = { corpus:null, verses:[], favorites:[], theme:'Sin', lastResults:[] };

function ctx(){ return window.SillyTavern?.getContext?.() || {}; }
function settings(){
  const c=ctx();
  c.extensionSettings ||= {};
  c.extensionSettings[MODULE] ||= {favorites:[]};
  c.extensionSettings[MODULE].favorites ||= [];
  state.favorites=c.extensionSettings[MODULE].favorites;
  return c.extensionSettings[MODULE];
}
function save(){ ctx().saveSettingsDebounced?.(); }
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function normalize(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9'\s-]/g,' '); }

function flattenCorpus(raw){
  const out=[];
  const add=(book, chapter, verse, text)=>{ if(text) out.push({book:String(book),chapter:Number(chapter),verse:Number(verse),text:String(text),id:`${book}|${chapter}|${verse}`}); };
  if(Array.isArray(raw)){
    for(const b of raw){
      const bn=b.name||b.book||b.book_name||b.title;
      const chs=b.chapters||b.chapter||b.data;
      if(Array.isArray(chs)) chs.forEach((ch,ci)=>{
        if(Array.isArray(ch)) ch.forEach((v,vi)=>add(bn,ci+1,vi+1,v.text||v.verse||v));
        else if(ch?.verses) ch.verses.forEach((v,vi)=>add(bn,ci+1,vi+1,v.text||v.verse||v));
      });
    }
  } else if(raw?.books && Array.isArray(raw.books)) return flattenCorpus(raw.books);
  else if(raw && typeof raw==='object'){
    for(const [book,bdata] of Object.entries(raw)){
      const chapters=bdata?.chapters||bdata;
      if(Array.isArray(chapters)) chapters.forEach((ch,ci)=>{
        if(Array.isArray(ch)) ch.forEach((v,vi)=>add(book,ci+1,vi+1,v?.text||v?.verse||v));
        else if(ch?.verses) ch.verses.forEach((v,vi)=>add(book,ci+1,vi+1,v?.text||v?.verse||v));
      });
    }
  }
  return out;
}

async function loadCorpus(){
  if(state.verses.length) return true;
  try{
    const saved=await window.SillyTavern?.libs?.localforage?.getItem?.(`${MODULE}_corpus`);
    if(saved?.length){ state.verses=saved; state.corpus='local'; return true; }
  }catch(e){ console.warn('[Bible Oracle] local cache read failed',e); }
  for(const url of KJV_SOURCES){
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw=await r.json();
      state.verses=flattenCorpus(raw);
      if(!state.verses.length) throw new Error('Unrecognized Bible JSON structure');
      state.corpus='KJV';
      try{ await window.SillyTavern?.libs?.localforage?.setItem?.(`${MODULE}_corpus`,state.verses); }catch(e){ console.warn(e); }
      console.log(`[Bible Oracle] KJV loaded from ${url}`);
      return true;
    }catch(e){ console.warn(`[Bible Oracle] KJV source failed: ${url}`,e); }
  }
  console.error('[Bible Oracle] all KJV sources failed');
  toastr.error('Could not download the KJV automatically. Import is only needed if all online sources are unavailable.','Bible Oracle');
  return false;
}

function scoreVerse(v, terms){
  const t=normalize(v.text);
  let score=0;
  for(const term of terms){
    const n=normalize(term); if(!n) continue;
    if(t.includes(` ${n} `) || t.startsWith(`${n} `) || t.endsWith(` ${n}`)) score+=3;
    else if(t.includes(n)) score+=1;
  }
  return score;
}
function searchTerms(terms, limit=20){
  const scored=state.verses.map(v=>({v,s:scoreVerse(v,terms)})).filter(x=>x.s>0);
  scored.sort((a,b)=>b.s-a.s || a.v.id.localeCompare(b.v.id));
  return scored.slice(0,limit).map(x=>({...x.v,score:x.s}));
}
function themeSearch(theme,limit=30){ return searchTerms(THEME_TERMS[theme]||[theme],limit); }
function literalSearch(q,limit=30){ return searchTerms(normalize(q).split(/\s+/).filter(w=>w.length>2),limit); }


async function semanticSearch(query, limit=12){
  query=String(query||'').trim();
  if(!query) return [];
  const {generateRaw}=ctx();
  // First ask the active ST model to turn the human query into a compact
  // semantic retrieval vocabulary. We still retrieve only from the verified
  // local KJV corpus, so the model never invents Scripture.
  let concepts=[...new Set(normalize(query).split(/\s+/).filter(w=>w.length>2))];
  if(typeof generateRaw==='function'){
    const prompt=`Convert this Bible passage search request into a compact list of concrete concepts, related words, biblical terms, imagery, and rhetorical ideas that are likely to appear in or point toward relevant KJV passages. Do not write verses. Return JSON only.\n\nSEARCH REQUEST:\n${query}`;
    const schema={name:'BibleOracleSearchConcepts',description:'Semantic search concepts.',strict:true,value:{type:'object',properties:{concepts:{type:'array',items:{type:'string'},maxItems:20}},required:['concepts'],additionalProperties:false}};
    try{
      const raw=await generateRaw({systemPrompt:'You are a semantic retrieval assistant for a verified Bible corpus. Never quote or invent Scripture.',prompt,jsonSchema:schema});
      const data=JSON.parse(raw||'{}');
      if(Array.isArray(data.concepts)) concepts=[...new Set(data.concepts.flatMap(x=>normalize(x).split(/\s+/)).filter(w=>w.length>2))].slice(0,40);
    }catch(e){ console.warn('[Bible Oracle] semantic concept expansion failed',e); }
  }
  const candidates=searchTerms(concepts,80);
  if(!candidates.length) return [];
  if(typeof generateRaw!=='function') return candidates.slice(0,limit);
  const compact=candidates.map((v,i)=>`${i+1}. ${v.book} ${v.chapter}:${v.verse} — ${v.text}`).join('\n');
  const prompt=`Select the most semantically relevant KJV passages for the search request. Consider meaning, situation, imagery, and rhetorical function, not merely shared words. You MUST choose only from the numbered candidates. Never invent or alter Scripture text. Return JSON only.\n\nSEARCH REQUEST:\n${query}\n\nCANDIDATES:\n${compact}`;
  const schema={name:'BibleOracleSemanticResults',description:'Rank existing Bible candidates.',strict:true,value:{type:'object',properties:{recommendations:{type:'array',items:{type:'object',properties:{index:{type:'integer',minimum:1,maximum:candidates.length},reason:{type:'string'}},required:['index','reason'],additionalProperties:false},maxItems:limit}},required:['recommendations'],additionalProperties:false}};
  try{
    const raw=await generateRaw({systemPrompt:'You rank verified Bible passages. Select only supplied candidates.',prompt,jsonSchema:schema});
    const data=JSON.parse(raw||'{}');
    return (data.recommendations||[]).map(x=>({v:candidates[x.index-1],reason:x.reason})).filter(x=>x.v);
  }catch(e){ console.warn('[Bible Oracle] semantic ranking failed',e); return candidates.slice(0,limit); }
}

function recentChat(){
  const c=ctx();
  const chat=Array.isArray(c.chat)?c.chat:[];
  return chat.slice(-24).map(m=>`${m.name||m.role||'Speaker'}: ${m.mes||m.content||''}`).join('\n').slice(-18000);
}
function lexicalSceneCandidates(chat,limit=40){
  const words=[...new Set(normalize(chat).split(/\s+/).filter(w=>w.length>=4 && !/^(that|this|with|have|from|they|them|were|your|what|when|then|just|into|there|their|about|would|could|should|said|like|very|been|will|shall|upon|only|some|more|than|were|here|over|under|after|before)$/.test(w)))];
  return searchTerms(words,limit);
}

async function rankWithModel(chat,candidates){
  const {generateRaw}=ctx();
  if(typeof generateRaw!=='function') return candidates.slice(0,8).map(v=>({id:v.id,reason:'Local keyword retrieval'}));
  const compact=candidates.map((v,i)=>`${i+1}. ${v.book} ${v.chapter}:${v.verse} — ${v.text}`).join('\n');
  const prompt=`You are selecting Bible passages for fictional roleplay dialogue. Read the scene and choose the passages that fit its themes, imagery, conflict, or rhetorical function. You MUST choose only from the numbered candidates below. Never invent or alter Scripture text. Return JSON only.\n\nSCENE:\n${chat}\n\nCANDIDATES:\n${compact}`;
  const schema={name:'BibleOracleRecommendations',description:'Select existing candidate Bible verses.',strict:true,value:{type:'object',properties:{recommendations:{type:'array',items:{type:'object',properties:{index:{type:'integer',minimum:1,maximum:candidates.length},reason:{type:'string'}},required:['index','reason'],additionalProperties:false},maxItems:8}},required:['recommendations'],additionalProperties:false}};
  try{
    const raw=await generateRaw({systemPrompt:'You are a Bible passage retrieval assistant. You do not quote Scripture from memory. You only select supplied candidates.',prompt,jsonSchema:schema});
    const data=JSON.parse(raw||'{}');
    return (data.recommendations||[]).map(x=>({v:candidates[x.index-1],reason:x.reason})).filter(x=>x.v);
  }catch(e){ console.warn('[Bible Oracle] model ranking failed',e); return candidates.slice(0,8).map(v=>({v,reason:'Local keyword retrieval'})); }
}

function resultCard(item,idx){
  const v=item.v||item; const reason=item.reason;
  const fav=state.favorites.includes(v.id);
  return `<div class="bible-oracle-result" data-id="${esc(v.id)}"><div class="bible-oracle-ref">${esc(v.book)} ${v.chapter}:${v.verse}</div><div class="bible-oracle-text">${esc(v.text)}</div>${reason?`<div class="bible-oracle-reason">${esc(reason)}</div>`:''}<div class="bible-oracle-actions"><button class="menu_button bo-copy" data-id="${esc(v.id)}">Copy</button><button class="menu_button bo-fav" data-id="${esc(v.id)}">${fav?'★ Saved':'☆ Save'}</button></div></div>`;
}
function findVerse(id){return state.verses.find(v=>v.id===id);}
function renderResults(items,target){ state.lastResults=items; $(target).html(items.length?items.map(resultCard).join(''):'<div class="bible-oracle-empty">No passages found.</div>'); bindResultButtons(target); }
function bindResultButtons(target){
  $(target).off('click.bo','.bo-copy').on('click.bo','.bo-copy',async function(){ const v=findVerse($(this).data('id')); if(!v)return; await navigator.clipboard?.writeText(`${v.book} ${v.chapter}:${v.verse} — ${v.text}`); toastr.success('Passage copied.','Bible Oracle'); });
  $(target).off('click.bo','.bo-fav').on('click.bo','.bo-fav',function(){ const id=$(this).data('id'); const s=settings(); s.favorites ||= []; s.favorites=s.favorites.includes(id)?s.favorites.filter(x=>x!==id):[...s.favorites,id]; state.favorites=s.favorites; save(); renderResults(state.lastResults,target); });
}

function buildPanel(){
  $('#bible_oracle_popup').remove();
  const html=`<div id="bible_oracle_popup" class="bible-oracle-popup"><div class="bible-oracle-header"><b>📖 Bible Oracle</b><button id="bo_close" class="menu_button">×</button></div><div class="bible-oracle-tabs"><button data-tab="catalogue" class="bo-tab active">Catalogue</button><button data-tab="scene" class="bo-tab">Current Scene</button><button data-tab="favorites" class="bo-tab">Favorites</button></div><div id="bo_catalogue" class="bo-page"><div class="bible-oracle-search"><input id="bo_search" class="text_pole" placeholder="Search the KJV..."/><button id="bo_search_btn" class="menu_button">Word Search</button><button id="bo_semantic_btn" class="menu_button">Semantic Search</button></div><div id="bo_themes" class="bible-oracle-themes">${THEMES.map(t=>`<button class="bo-theme ${t===state.theme?'selected':''}" data-theme="${esc(t)}">${esc(t)}</button>`).join('')}</div><div id="bo_catalogue_results"></div></div><div id="bo_scene" class="bo-page" style="display:none"><p class="bible-oracle-muted">Reads the recent RP chat, retrieves real KJV candidates locally, then optionally asks the current ST model to rank only those candidates.</p><button id="bo_analyze" class="menu_button">Analyze Current Scene</button><div id="bo_scene_results"></div></div><div id="bo_favorites" class="bo-page" style="display:none"><div id="bo_fav_results"></div></div><div class="bible-oracle-footer"><span id="bo_status">Loading KJV…</span><label class="menu_button bo-import">Import KJV JSON<input id="bo_import" type="file" accept="application/json,.json" hidden></label></div></div>`;
  $('body').append(html);
  $('#bo_close').on('click',()=>$('#bible_oracle_popup').remove());
  $('.bo-tab').on('click',function(){ const tab=$(this).data('tab'); $('.bo-tab').removeClass('active');$(this).addClass('active');$('.bo-page').hide();$(`#bo_${tab}`).show();if(tab==='favorites')renderFavorites(); });
  $('.bo-theme').on('click',async function(){ state.theme=$(this).data('theme');$('.bo-theme').removeClass('selected');$(this).addClass('selected');if(await loadCorpus())renderResults(themeSearch(state.theme), '#bo_catalogue_results'); });
  $('#bo_search_btn').on('click',async()=>{if(await loadCorpus())renderResults(literalSearch($('#bo_search').val()),'#bo_catalogue_results');});
  $('#bo_search').on('keydown',e=>{if(e.key==='Enter')$('#bo_search_btn').click();});
  $('#bo_semantic_btn').on('click',async()=>{const q=$('#bo_search').val();if(!q)return;if(await loadCorpus()){ $('#bo_catalogue_results').html('<div class=\"bible-oracle-muted\">Interpreting the search and ranking relevant passages…</div>'); const r=await semanticSearch(q,12); renderResults(r,'#bo_catalogue_results'); }});
  $('#bo_analyze').on('click',analyzeScene);
  $('#bo_import').on('change',async function(){try{const f=this.files?.[0];if(!f)return;const raw=JSON.parse(await f.text());const verses=flattenCorpus(raw);if(!verses.length)throw new Error('Unrecognized structure');state.verses=verses;state.corpus='imported';await window.SillyTavern?.libs?.localforage?.setItem?.(`${MODULE}_corpus`,verses);$('#bo_status').text(`Loaded ${verses.length.toLocaleString()} verses`);renderResults(themeSearch(state.theme),'#bo_catalogue_results');toastr.success('KJV corpus imported.','Bible Oracle');}catch(e){console.error(e);toastr.error('That JSON was not recognized as a Bible corpus.','Bible Oracle');}});
  loadCorpus().then(ok=>{ $('#bo_status').text(ok?`Loaded ${state.verses.length.toLocaleString()} verses`:'KJV not loaded'); if(ok)renderResults(themeSearch(state.theme),'#bo_catalogue_results'); });
}
async function analyzeScene(){
  const out='#bo_scene_results'; $(out).html('<div class="bible-oracle-muted">Reading the scene and retrieving candidates…</div>');
  if(!(await loadCorpus()))return;
  const chat=recentChat(); if(!chat){$(out).html('<div class="bible-oracle-empty">No current chat content found.</div>');return;}
  const candidates=lexicalSceneCandidates(chat,40);
  if(!candidates.length){$(out).html('<div class="bible-oracle-empty">No lexical Bible matches found in the recent scene.</div>');return;}
  $(out).html('<div class="bible-oracle-muted">Ranking candidates…</div>');
  const ranked=await rankWithModel(chat,candidates);
  renderResults(ranked,out);
}
function renderFavorites(){
  const items=state.favorites.map(findVerse).filter(Boolean).map(v=>({v,reason:''}));
  renderResults(items,'#bo_fav_results');
}

function init(){
  settings();
  $('#bible_oracle_open').off('click.bo').on('click.bo',buildPanel);
  if(!$('#bible_oracle_open').length) console.warn('[Bible Oracle] settings UI not found');
  console.log(`[Bible Oracle] ${VERSION} loaded`);
}

jQuery(()=>{
  try {
    const settingsHtml = `
      <div class="bible-oracle-settings">
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>📖 Bible Oracle</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            <input id="bible_oracle_open" class="menu_button" type="button" value="Open Bible Oracle" />
            <div class="bible-oracle-muted">Verified KJV retrieval + contextual passage suggestions.</div>
          </div>
        </div>
      </div>`;
    if (!$('#bible_oracle_open').length) {
      $('#extensions_settings2').append(settingsHtml);
    }
    init();
  } catch (e) {
    console.error('[Bible Oracle] init failed', e);
    try { toastr.error('Bible Oracle failed to initialize. Check the browser console.', 'Bible Oracle'); } catch {}
  }
});

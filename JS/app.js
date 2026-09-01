// ── BLOG DATA ─────────────────────────────────────────

const ICONS={poem:'🌸',story:'📖',article:'✒️',other:'✦'};
const LC={'ಕನ್ನಡ':'kn','English':'en','Mixed':'mixed'};

// Render the bundled content immediately on a refresh. Firebase replaces it
// in the background, so a slow connection never leaves the page blank.
let POSTS=[...DP],CATS=JSON.parse(JSON.stringify(DC)),likes={},likedMe=new Set();
let Q=null,QA=[...DQA],QS=[],qDraft=[],editQId=false,qSubmitted=false;
let adminAuth=false,editId=null,catF='all',langF='all',searchQ='';

function hSearch(v){
  searchQ=v.toLowerCase().trim();
  const clr=document.getElementById('sclr');
  if(clr)clr.style.display=searchQ?'':'none';
  renderHome()
}
function clearSearch(){
  searchQ='';
  const inp=document.getElementById('sinp');if(inp)inp.value='';
  const clr=document.getElementById('sclr');if(clr)clr.style.display='none';
  renderHome()
}

async function loadAll(){
  const [posts,categories,activeQuiz,archive] = await Promise.allSettled([
    window.getFirestorePosts?window.getFirestorePosts():Promise.resolve([...DP]),
    window.getFirestoreCategories?window.getFirestoreCategories():Promise.resolve(JSON.parse(JSON.stringify(DC))),
    window.getFirestoreActiveQuiz?window.getFirestoreActiveQuiz():Promise.resolve(null),
    window.getFirestoreQuizzes?window.getFirestoreQuizzes():Promise.resolve([...DQA])
  ]);

  if(posts.status==='fulfilled')POSTS=posts.value;
  else console.error('Posts load failed:',posts.reason);
  if(categories.status==='fulfilled'&&categories.value)CATS=categories.value;
  else if(categories.status==='rejected')console.error('Categories load failed:',categories.reason);
  if(activeQuiz.status==='fulfilled')Q=activeQuiz.value||null;
  else console.error('Active quiz load failed:',activeQuiz.reason);
  if(archive.status==='fulfilled')QA=archive.value.filter(q=>q.state==='archived'&&Array.isArray(q.questions));
  else console.error('Quiz archive load failed:',archive.reason);

  // Show the Firestore content as soon as it arrives. Likes are deliberately
  // loaded afterward because they require the anonymous visitor session.
  renderHome();
  try{
    likes={};likedMe=new Set();
    await Promise.all(POSTS.map(async p=>{
      likes[p.id]=await window.getFirestoreLikes(p.id);
      if(await window.getMyFirestoreLike(p.id))likedMe.add(p.id);
    }));
    renderHome();
  }catch(e){console.error('Reactions load failed:',e)}
}
const svP=(post)=>window.saveFirestorePost(post);
const svC=()=>window.saveFirestoreCategories(CATS);
const svQ=()=>window.saveFirestoreActiveQuiz(Q);
const svQA=()=>Promise.resolve();
const svQS=()=>Promise.resolve();
async function ldCmt(id){

  try{

    if(window.getFirestoreComments){
      return await window.getFirestoreComments(id);
    }

    return [];

  }catch(e){

    console.error("Comment load failed",e);
    return [];

  }

}
async function svCmt(id,c){
  await window.saveFirestoreComment(id,c);
  return await ldCmt(id);
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function autoExc(b){if(!b)return'';if(b.length<=160)return b;const t=b.substring(0,160);const i=Math.max(t.lastIndexOf(' '),t.lastIndexOf('\n'));return t.substring(0,i>80?i:140)+'...'}
function postTags(p){
  const labels=Array.isArray(p.labels)?[...new Set(p.labels.map(x=>String(x).trim()).filter(Boolean))]:[];
  const extraLabels=labels.filter(label=>label!==p.subcat);
  return `<div class="tags"><span class="tcat">${esc(p.cat)}</span>${p.subcat?`<span class="tsub">${esc(p.subcat)}</span>`:''}${extraLabels.map(label=>`<span class="tlabel">${esc(label)}</span>`).join('')}<span class="tlang">${esc(p.lang)}</span></div>`
}
function safeContentUrl(value){
  try{
    const url=new URL(value,location.href);
    return ['https:','http:'].includes(url.protocol)?url.href:'';
  }catch(e){return ''}
}
function safePostHtml(html){
  const template=document.createElement('template');
  template.innerHTML=String(html||'');
  const allowed=new Set(['a','b','blockquote','br','div','em','i','img','li','ol','p','span','strong','u','ul']);
  const blocked=new Set(['base','embed','form','iframe','link','meta','object','script','style','svg']);
  for(const el of Array.from(template.content.querySelectorAll('*')).reverse()){
    const tag=el.tagName.toLowerCase();
    if(blocked.has(tag)){el.remove();continue}
    if(!allowed.has(tag)){el.replaceWith(...Array.from(el.childNodes));continue}
    const href=tag==='a'?safeContentUrl(el.getAttribute('href')):'';
    const src=tag==='img'?safeContentUrl(el.getAttribute('src')):'';
    const alt=tag==='img'?(el.getAttribute('alt')||''):'';
    for(const attr of Array.from(el.attributes))el.removeAttribute(attr.name);
    if(tag==='a'&&href){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}
    if(tag==='img'){
      if(!src){el.remove();continue}
      el.setAttribute('src',src);if(alt)el.setAttribute('alt',alt)
    }
  }
  return template.innerHTML;
}
function postContent(p){
  const cover=safeContentUrl(p.coverImage);
  const coverHtml=cover?`<img class="post-cover" src="${cover}" alt="${esc(p.title)} cover">`:'';
  return p.html?coverHtml+safePostHtml(p.html):esc(p.body)
}
function bodyToRichHtml(body){
  return String(body).split(/\n{2,}/).filter(Boolean).map(paragraph=>`<p>${esc(paragraph).replace(/\n/g,'<br>')}</p>`).join('')
}
function todayStr(){return new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}

// ── NAVIGATION ────────────────────────────────────────
function go(page,id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('nav a').forEach(a=>a.classList.remove('on'));
  const map={home:'ph',post:'pp',index:'pidx',about:'pab',adminlogin:'pal',admin:'pad',quiz:'pq',qdetail:'pqd',cert:'pcert'};
  document.getElementById(map[page])?.classList.add('on');
  if(page==='home'){document.getElementById('nh').classList.add('on');renderHome()}
  else if(page==='post'&&id)renderPost(id);
  else if(page==='index'){document.getElementById('ni').classList.add('on');renderIdx()}
  else if(page==='about')document.getElementById('na').classList.add('on');
  else if(page==='admin'){if(!adminAuth){go('adminlogin');return}renderAdmin()}
  else if(page==='quiz'){document.getElementById('nq').classList.add('on');qSubmitted=false;renderQuiz()}
  else if(page==='qdetail'&&id)renderQDetail(id);
  window.scrollTo(0,0)
}

// ── BLOG FILTERS ──────────────────────────────────────
function cf(btn,v){catF=v;document.querySelectorAll('.fb.cat').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderHome()}
function lf(btn,v){langF=v;document.querySelectorAll('.fb.lang').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderHome()}
function renderCatFilters(){
  let h=`<button class="fb cat${catF==='all'?' on':''}" onclick="cf(this,'all')">All</button>`;
  Object.keys(CATS).forEach(k=>h+=`<button class="fb cat${catF===k?' on':''}" onclick="cf(this,'${k}')">${esc(CATS[k].label)}</button>`);
  h+=`<span class="sep">|</span><button class="fb lang${langF==='all'?' on':''}" onclick="lf(this,'all')">All Languages</button>
    <button class="fb lang${langF==='kn'?' on':''}" onclick="lf(this,'kn')">ಕನ್ನಡ</button>
    <button class="fb lang${langF==='en'?' on':''}" onclick="lf(this,'en')">English</button>
    <button class="fb lang${langF==='mixed'?' on':''}" onclick="lf(this,'mixed')">Mixed</button>`;
  document.getElementById('filters').innerHTML=h
}

// ── BLOG RENDER ───────────────────────────────────────
function renderHome(){
  renderCatFilters();
  const g=document.getElementById('grid'),sr=document.getElementById('sres');
  let fp=POSTS.filter(p=>(catF==='all'||p.cc===catF)&&(langF==='all'||p.lc===langF));
  if(searchQ){
    fp=fp.filter(p=>
      p.title.toLowerCase().includes(searchQ)||
      p.body.toLowerCase().includes(searchQ)||
      p.cat.toLowerCase().includes(searchQ)||
      (p.subcat&&p.subcat.toLowerCase().includes(searchQ))||
      (Array.isArray(p.labels)&&p.labels.some(label=>String(label).toLowerCase().includes(searchQ)))||
      p.lang.toLowerCase().includes(searchQ)
    );
    if(sr)sr.textContent=fp.length
      ?`${fp.length} result${fp.length!==1?'s':''} for "${searchQ}"`
      :`No writings found for "${searchQ}"`;
  }else{if(sr)sr.textContent=''}
  if(!fp.length){g.innerHTML='<div class="empty">No writings match.</div>';return}
  g.innerHTML=fp.map(p=>`<div class="card" onclick="go('post',${p.id})">
    ${postTags(p)}
    <h2>${esc(p.title)}</h2><p class="exc">${esc(p.exc||autoExc(p.body))}</p>
    <div class="cf"><span>${p.date}</span><span>♥ ${likes[p.id]||0}</span></div>
  </div>`).join('')
}
async function renderPost(id){
  const p=POSTS.find(x=>x.id===id);if(!p)return;
  const lc=likes[p.id]||0,il=likedMe.has(p.id),cmts=await ldCmt(p.id);
  const ch=cmts.length?cmts.map(c=>`<div class="ci"><div class="chdr"><span class="cauth">${esc(c.name||'Anonymous')}</span><span class="cdate">${c.date}</span></div><p class="ctxt">${esc(c.txt)}</p></div>`).join(''):'<div class="noc">Be the first to leave a thought...</div>';
  document.getElementById('pvc').innerHTML=`<div class="pvh">
    ${postTags(p)}
    <h1>${esc(p.title)}</h1><p class="pmeta">Written on ${p.date}</p></div>
    <div class="pbody${p.cc==='poem'?' poem':''}${p.html?' richbody':''}">${postContent(p)}</div>
    <div class="div">✦</div>
    <div class="pactions">
      <button class="lbtn${il?' liked':''}" id="lb${p.id}" onclick="tlike(${p.id})">${il?'♥':'♡'} <span id="lc${p.id}">${lc}</span> ${lc===1?'like':'likes'}</button>
      <button class="sbtn" onclick="shr(${p.id})">↗ Share</button>
      <span class="stoast" id="st${p.id}">Link copied!</span>
    </div>
    <div class="cs"><h3>Thoughts &amp; Reactions</h3>
      <div class="cform">
        <input type="text" id="cn${p.id}" placeholder="Your name (leave blank for anonymous)" maxlength="60">
        <textarea id="ct${p.id}" rows="3" placeholder="Write your thoughts here..."></textarea>
        <button class="csub" onclick="addCmt(${p.id})">Post Comment</button>
      </div>
      <div class="clist" id="cl${p.id}">${ch}</div>
    </div>
    <div class="div" style="margin-top:36px">✦ ✦ ✦</div>
    <div class="pnav">
      <button class="back" onclick="go('home')">← All Writings</button>
      <button class="back" onclick="go('index')">☰ Index</button>
      <button class="back" onclick="go('about')">✍ About Me</button>
    </div>`
}
async function tlike(id){
  const next=!likedMe.has(id);
  try{await window.toggleFirestoreLike(id,next)}catch(e){console.error('Reaction failed:',e);alert('Your reaction could not be saved. Please try again.');return}
  if(next){likedMe.add(id);likes[id]=(likes[id]||0)+1}
  else{likedMe.delete(id);likes[id]=Math.max(0,(likes[id]||0)-1)}

  const il=likedMe.has(id),
        lc=likes[id]||0,
        btn=document.getElementById('lb'+id);

  if(btn){
    btn.className='lbtn'+(il?' liked':'');
    btn.innerHTML=`${il?'♥':'♡'} <span id="lc${id}">${lc}</span> ${lc===1?'like':'likes'}`;
  }
}
function shr(id){
  const p=POSTS.find(x=>x.id===id),t=document.getElementById('st'+id);
  if(navigator.share)navigator.share({title:p?.title||'',text:"A writing by DK"}).catch(()=>{});
  else{try{navigator.clipboard.writeText(location.href+'#post-'+id)}catch(e){}if(t){t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}}
}
async function addCmt(id){
  const n=document.getElementById('cn'+id),t=document.getElementById('ct'+id);
  if(!t?.value.trim())return;
  if(t.value.trim().length>2000){alert('Please keep comments under 2,000 characters.');return}
  const c={name:n.value.trim()||'Anonymous',txt:t.value.trim(),date:todayStr()};
  let arr;
  try{arr=await svCmt(id,c)}catch(e){console.error('Comment save failed:',e);alert('Your comment could not be posted. Please try again.');return}
  n.value='';t.value='';
  const cl=document.getElementById('cl'+id);
  if(cl)cl.innerHTML=arr.map(x=>`<div class="ci"><div class="chdr"><span class="cauth">${esc(x.name||'Anonymous')}</span><span class="cdate">${x.date}</span></div><p class="ctxt">${esc(x.txt)}</p></div>`).join('')
}
function renderIdx(){
  document.getElementById('idxc').innerHTML=Object.keys(CATS).map(k=>{
    const ps=POSTS.filter(p=>p.cc===k);if(!ps.length)return'';
    return`<div class="icat"><h3>${ICONS[k]||'✦'} ${esc(CATS[k].label)}</h3><div class="ilist">${ps.map(p=>`
      <div class="ii" onclick="go('post',${p.id})">
        <span class="iititle">${esc(p.title)}</span>
        ${p.subcat?`<span class="tsub" style="font-size:.7rem">${esc(p.subcat)}</span>`:''}
        <span class="tlang" style="font-size:.7rem">${esc(p.lang)}</span>
        <span class="iimeta">${p.date}</span>
      </div>`).join('')}</div></div>`}).join('')
}

// ── QUIZ PUBLIC ───────────────────────────────────────
function qTab(t){
  const c=document.getElementById('qcur'),a=document.getElementById('qarc');
  const sc=document.getElementById('qsn-c'),sa=document.getElementById('qsn-a');
  if(t==='c'){c.style.display='';a.style.display='none';sc.classList.add('on');sa.classList.remove('on')}
  else{c.style.display='none';a.style.display='';sa.classList.add('on');sc.classList.remove('on');renderQArcList()}
}
function renderQuiz(){
  const cur=document.getElementById('qcur');
  if(!Q){
    cur.innerHTML=`<div style="text-align:center;padding:60px 20px">
      <div style="font-size:3rem;margin-bottom:16px">📝</div>
      <h3 style="font-family:'Playfair Display',serif;color:var(--ac);font-size:1.4rem;margin-bottom:10px">No Active Quiz Right Now</h3>
      <p style="color:var(--il);font-style:italic;margin-bottom:24px">Check back soon, or explore past quizzes in the Archive.</p>
      <button class="qsn" onclick="qTab('a')">View Archive →</button>
    </div>`;
  } else if(Q.state==='upcoming'){
    cur.innerHTML=`<div class="qposter">
      <div style="font-size:2.5rem;margin-bottom:14px">🏆</div>
      <h3>${esc(Q.title)}</h3>
      <div class="qpos-sub">${Q.date?'📅 '+esc(Q.date):''}</div>
      <p class="qpos-desc">${esc(Q.description||'')}</p>
      ${Q.prize?`<div class="qpos-prize">🎁 Prize: ${esc(Q.prize)}</div><br>`:''}
      ${Q.deadline?`<div class="qpos-dl">⏰ Deadline: ${esc(Q.deadline)}</div>`:''}
    </div>`;
  } else if(Q.state==='live'){
    if(qSubmitted){
      cur.innerHTML=`<div style="text-align:center;padding:40px"><p style="color:var(--il);font-style:italic">You have already submitted this quiz. Thank you for participating! 🙏</p></div>`;
    } else {
      renderLiveQuiz(cur);
    }
  } else if(Q.state==='closed'){
    cur.innerHTML=`<div style="text-align:center;padding:60px 20px">
      <div style="font-size:2rem;margin-bottom:14px">🔒</div>
      <h3 style="font-family:'Playfair Display',serif;color:var(--ac);margin-bottom:10px">Quiz Closed</h3>
      <p style="color:var(--il);font-style:italic">This quiz has ended. Results will be announced soon.</p>
    </div>`;
  }
  renderQArcList()
}
function renderLiveQuiz(el){
  el.innerHTML=`<div class="qform-wrap">
    <div class="qnamebox">
      <h3>Your Details</h3>
      <input type="text" id="q-name" placeholder="Your name (appears on certificate)" maxlength="80">
      ${Q.type==='prize'?`<input type="text" id="q-con" placeholder="Email or WhatsApp (for prize contact only — not stored permanently)" maxlength="100">`:''}
    </div>
    ${Q.questions.map((qu,i)=>`<div class="qcard" id="qc-${i}">
      <div class="qnum">Question ${i+1} of ${Q.questions.length}</div>
      <div class="qtxt">${esc(qu.q)}</div>
      <div class="qopts">${qu.opts.map((o,j)=>`
        <label class="qopt" id="qo-${i}-${j}" onclick="selOpt(${i},${j})">
          <input type="radio" name="qr-${i}" value="${j}"><span>${esc(o)}</span>
        </label>`).join('')}
      </div>
    </div>`).join('')}
    <button class="qsubmit" onclick="submitQuiz()">Submit Answers ✓</button>
  </div>`
}
function selOpt(qi,oi){
  document.querySelectorAll(`[id^="qo-${qi}-"]`).forEach(e=>e.classList.remove('sel'));
  document.getElementById(`qo-${qi}-${oi}`)?.classList.add('sel');
  const r=document.getElementById(`qo-${qi}-${oi}`)?.querySelector('input[type=radio]');
  if(r)r.checked=true
}
async function submitQuiz(){
  const name=document.getElementById('q-name')?.value.trim();
  if(!name){alert('Please enter your name before submitting.');return}
  if(!Q)return;
  const answers=Q.questions.map((_,i)=>{
    const c=document.querySelector(`input[name="qr-${i}"]:checked`);return c?parseInt(c.value):-1
  });
  const ua=answers.filter(a=>a===-1).length;
  if(ua>0&&!confirm(`${ua} question(s) unanswered. Submit anyway?`))return;
  let score=0;
  Q.questions.forEach((q,i)=>{if(answers[i]===q.ans)score++});
  if(Q.type==='prize'){
    const con=document.getElementById('q-con')?.value.trim()||'';
    QS.push({name,con,score,total:Q.questions.length,time:todayStr(),answers});
    svQS()
  }
  if(!Q.stats)Q.stats={total:0,qs:{}};
  Q.stats.total=(Q.stats.total||0)+1;
  Q.questions.forEach((q,i)=>{
    if(!Q.stats.qs[i])Q.stats.qs[i]={c:0,w:0};
    if(answers[i]===q.ans)Q.stats.qs[i].c++;else Q.stats.qs[i].w++
  });
  qSubmitted=true;
  showResults(Q,answers,name,score)
}
function showResults(q,answers,name,score){
  const total=q.questions.length,pct=Math.round(score/total*100);
  const cur=document.getElementById('qcur');
  certData={name,title:q.title,score,total,date:todayStr()};
  let h=`<div class="qscore-box">
    <div style="font-size:1.8rem;margin-bottom:8px">${score===total?'🏆':score>=total*.7?'🎉':score>=total*.5?'👍':'📚'}</div>
    <div class="qscore">${score} / ${total}</div>
    <div class="qscore-sub">${pct}% · ${score===total?'Perfect!':score>=total*.7?'Well done!':score>=total*.5?'Good effort!':'Keep reading!'}</div>
    ${q.type==='certificate'?`<br><button class="certbtn" onclick="genCert()">📜 Download Certificate</button>`:''}
    ${q.type==='prize'?`<p style="color:var(--il);font-size:.88rem;font-style:italic;margin-top:14px">Thank you ${esc(name)}! If you're among the winners, we'll reach out to you soon. 🎁</p>`:''}
  </div><div class="qform-wrap">`;
  q.questions.forEach((qu,i)=>{
    const ua=answers[i],ok=ua===qu.ans;
    h+=`<div class="qcard" style="border-left-color:${ok?'#2d6a2d':'#c0392b'}">
      <div class="qnum">Q${i+1} — ${ok?'✓ Correct':'✗ Incorrect'}</div>
      <div class="qtxt">${esc(qu.q)}</div>
      <div class="qopts">${qu.opts.map((o,j)=>`
        <div class="qopt${j===qu.ans?' ok':ua===j&&!ok?' bad':''}">
          <span>${j===qu.ans?'✓ ':''}${esc(o)}</span>
        </div>`).join('')}
      </div>
      ${qu.exp?`<div class="qexp">💡 ${esc(qu.exp)}</div>`:''}
    </div>`
  });
  h+='</div>';cur.innerHTML=h
}
let certData=null;
function genCert(){
  if(!certData)return;
  const {name,title,score,total,date}=certData;
  document.getElementById('cert-inner').innerHTML=`
    <div style="position:relative;background:#fffdf5;border:1px solid #c8a87a;border-radius:4px;padding:48px 56px;text-align:center;box-shadow:0 4px 24px rgba(44,26,14,.12)">
      <div style="position:absolute;inset:12px;border:1px solid #e8d5b0;border-radius:2px;pointer-events:none"></div>
      <div style="color:#c8a87a;font-size:1.3rem;letter-spacing:8px;margin-bottom:18px">✦ ✦ ✦</div>
      <div style="font-family:'Playfair Display',serif;color:#7a3b1e;font-size:.8rem;letter-spacing:3px;text-transform:uppercase;margin-bottom:26px">Certificate of Participation</div>
      <p style="color:#5a3e2b;font-size:.95rem;font-style:italic;margin-bottom:8px">This is to certify that</p>
      <div style="font-family:'Playfair Display',serif;color:#2c1a0e;font-size:2.2rem;margin:10px 0;border-bottom:1px solid #c8a87a;padding-bottom:10px">${esc(name)}</div>
      <p style="color:#5a3e2b;font-size:.9rem;font-style:italic;margin-bottom:6px">has successfully participated in</p>
      <div style="font-family:'Playfair Display',serif;color:#7a3b1e;font-size:1.2rem;margin-bottom:14px">${esc(title)}</div>
      <div style="display:inline-block;padding:5px 20px;border:1px solid #c8a87a;border-radius:20px;color:#7a3b1e;font-size:.85rem;margin-bottom:24px">Score: ${score} / ${total}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;padding-top:18px;border-top:1px solid #e8d5b0">
        <div style="text-align:center;flex:1">
          <div style="font-family:'Playfair Display',serif;color:#2c1a0e;font-size:1rem;border-top:1px solid #c8a87a;padding-top:7px;display:inline-block;min-width:150px">DK</div>
          <div style="font-size:.74rem;color:#c8a87a;font-style:italic;margin-top:3px">ಬರಹಗಾರ / Author</div>
        </div>
        <div style="font-size:.76rem;color:#c8a87a;font-style:italic">${esc(date)}</div>
      </div>
    </div>`;
  go('cert')
}
function renderQArcList(){
  const el=document.getElementById('qarc');
  if(!QA.length){el.innerHTML='<div class="empty">No archived quizzes yet. Past quizzes will appear here.</div>';return}
  el.innerHTML='<h3 style="font-family:\'Playfair Display\',serif;color:var(--ac);margin-bottom:16px">Past Quizzes</h3>'+
  QA.map(q=>`<div class="aqcard" onclick="go('qdetail',${q.id})">
    <div><div class="aqcard-title">${esc(q.title)}</div>
    <div class="aqcard-meta">${q.date} · ${q.total} participants · ${(q.questions||[]).length} questions</div></div>
    <span class="tsub" style="font-size:.74rem">${q.type==='prize'?'🎁 Prize':'📜 Certificate'}</span>
  </div>`).join('')
}
function renderQDetail(id){
  const q=QA.find(x=>x.id===id);if(!q)return;
  const tot=q.questions.reduce((s,qu)=>{const t=(qu.stats?.c||0)+(qu.stats?.w||0);return s+t},0);
  const cor=q.questions.reduce((s,qu)=>s+(qu.stats?.c||0),0);
  document.getElementById('qdc').innerHTML=`
    <h1 class="stitle">${esc(q.title)}</h1>
    <p class="ssub">${q.date} · ${q.type==='certificate'?'Certificate Quiz':'Prize Quiz'}</p>
    <div class="aqstats">
      <div class="aqstat"><div class="aqstat-n">${q.total}</div><div class="aqstat-l">Participants</div></div>
      <div class="aqstat"><div class="aqstat-n">${q.questions.length}</div><div class="aqstat-l">Questions</div></div>
      <div class="aqstat"><div class="aqstat-n">${tot?Math.round(cor/tot*100)+'%':'—'}</div><div class="aqstat-l">Avg. Correct</div></div>
    </div>
    ${q.questions.map((qu,i)=>{
      const c=qu.stats?.c||0,w=qu.stats?.w||0,t=c+w,p=t?Math.round(c/t*100):0;
      return`<div class="aqq">
        <div class="aqq-t">${i+1}. ${esc(qu.q)}</div>
        ${qu.opts.map((o,j)=>`<div class="aqopt${j===qu.ans?' ans':''}">${j===qu.ans?'✓ ':''}${esc(o)}</div>`).join('')}
        ${qu.exp?`<div class="qexp">💡 ${esc(qu.exp)}</div>`:''}
        ${t?`<div class="sbar"><div class="sbar-f" style="width:${p}%"></div></div><div class="spct">${p}% correct (${c} of ${t})</div>`:''}
      </div>`}).join('')}
    <div class="div" style="margin-top:32px">✦</div>
    <div class="pnav"><button class="back" onclick="go('quiz')">← Back to Quiz</button></div>`
}

// ── ADMIN ─────────────────────────────────────────────
async function aLogin(){
  const error=document.getElementById('aerr');
  error.textContent='Opening secure sign-in…';
  try{
    await window.signInAdmin();
    adminAuth=window.isFirebaseOwner();
    if(!adminAuth)throw new Error('This account is not authorized to administer the site.');
    error.textContent='';go('admin');
  }catch(e){
    console.error('Admin sign-in failed:',e);
    adminAuth=false;
    error.textContent=e.message||'Sign-in was not completed. Please try again.';
  }
}
async function aLogout(){adminAuth=false;await window.signOutAdmin();go('home')}
function aTab(btn,tab){
  document.querySelectorAll('.adtab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.adtabc').forEach(c=>c.classList.remove('on'));
  btn.classList.add('on');document.getElementById('atab-'+tab).classList.add('on');
  if(tab==='cats')renderAdCats();
  else if(tab==='quiz')renderAdQuiz()
}
function renderAdmin(){
  document.querySelectorAll('.adtab').forEach((b,i)=>b.classList.toggle('on',i===0));
  document.querySelectorAll('.adtabc').forEach((c,i)=>c.classList.toggle('on',i===0));
  document.getElementById('afw').innerHTML='';editId=null;renderAdPosts()
}

// ── ADMIN: POSTS ──────────────────────────────────────
function renderAdPosts(){
  const el=document.getElementById('apl');
  if(!POSTS.length){el.innerHTML='<div class="empty">No posts yet.</div>';return}
  el.innerHTML=[...POSTS].reverse().map(p=>`<div class="apost">
    <div class="apost-info"><div class="apost-title">${esc(p.title)}</div>
    <div class="apost-meta">${esc(p.cat)}${p.subcat?' · '+esc(p.subcat):''} · ${esc(p.lang)} · ${p.date}</div></div>
    <div class="apost-acts" id="da${p.id}">
      <button class="editbtn" onclick="startEdit(${p.id})">Edit</button>
      <button class="delbtn" onclick="askDel(${p.id})">Delete</button>
    </div>
  </div>`).join('')
}
function askDel(id){
  const el=document.getElementById('da'+id);if(!el)return;
  el.innerHTML=`<span style="font-size:.78rem;color:var(--il)">Sure?</span>
    <button class="delbtn hot" onclick="delPost(${id})">Yes</button>
    <button class="cancelbtn" style="padding:5px 10px;font-size:.8rem" onclick="renderAdPosts()">No</button>`
}
async function delPost(id){
  const post=POSTS.find(x=>x.id===id);if(!post)return;
  try{await window.deleteFirestorePost(post);POSTS=POSTS.filter(x=>x.id!==id);renderAdPosts()}
  catch(e){console.error('Post deletion failed:',e);alert('The post could not be deleted. Please try again.')}
}
function subsHtml(catKey,selSub){
  if(!catKey||!CATS[catKey])return'<option value="">— choose a main category first —</option>';
  return'<option value="">— Select sub-category —</option>'+CATS[catKey].subs.map(s=>`<option value="${esc(s)}"${s===selSub?' selected':''}>${esc(s)}</option>`).join('')
}
function updateSubs(catKey){const el=document.getElementById('f-sc');if(el)el.innerHTML=subsHtml(catKey,'')}
function buildFormHtml(){
  const p=editId?POSTS.find(x=>x.id===editId):null;
  const catOpts=Object.keys(CATS).map(k=>`<option value="${k}"${p&&p.cc===k?' selected':''}>${esc(CATS[k].label)}</option>`).join('');
  return`<div class="aform"><h3>${p?'Edit Post':'New Post'}</h3>
    <div class="frow"><label>Title</label><input type="text" id="f-t" placeholder="Title"></div>
    <div class="frow2">
      <div class="frow"><label>Language</label><select id="f-l">
        <option value="ಕನ್ನಡ"${!p||p.lc==='kn'?' selected':''}>ಕನ್ನಡ</option>
        <option value="English"${p&&p.lc==='en'?' selected':''}>English</option>
        <option value="Mixed"${p&&p.lc==='mixed'?' selected':''}>Mixed</option>
      </select></div>
      <div class="frow"><label>Date</label><input type="text" id="f-d" placeholder="e.g. 1 Jun 2025"></div>
    </div>
    <div class="frow2">
      <div class="frow"><label>Main Category</label><select id="f-c" onchange="updateSubs(this.value)"><option value="">— Select —</option>${catOpts}</select></div>
      <div class="frow"><label>Sub-category</label><select id="f-sc">${subsHtml(p?.cc||'',p?.subcat||'')}</select></div>
    </div>
    <div class="frow"><label>Excerpt <span style="font-weight:400;color:var(--gd)">(optional)</span></label><textarea id="f-e" rows="2" placeholder="Auto-generated if blank"></textarea></div>
    ${p?.html?'<p class="import-note">Imported formatting is preserved until you change the body. Saving body edits updates the reader version from the text below.</p>':''}
    <div class="frow"><label>Body</label><textarea id="f-b" rows="13" placeholder="Your writing..."></textarea></div>
    <div class="fbts"><button class="savebtn" onclick="savePost()">💾 Save</button><button class="cancelbtn" onclick="cancelForm()">Cancel</button></div>
  </div>`
}
function startAdd(){editId=null;document.getElementById('afw').innerHTML=buildFormHtml();document.getElementById('f-d').value=todayStr();document.getElementById('afw').scrollIntoView({behavior:'smooth',block:'start'})}
function startEdit(id){
  editId=id;const p=POSTS.find(x=>x.id===id);if(!p)return;
  document.getElementById('afw').innerHTML=buildFormHtml();
  document.getElementById('f-t').value=p.title;document.getElementById('f-d').value=p.date;
  document.getElementById('f-e').value=p.exc||'';document.getElementById('f-b').value=p.body;
  document.getElementById('afw').scrollIntoView({behavior:'smooth',block:'start'})
}
function cancelForm(){document.getElementById('afw').innerHTML='';editId=null}
async function savePost(){
  const title=document.getElementById('f-t').value.trim(),langV=document.getElementById('f-l').value;
  const catKey=document.getElementById('f-c').value,subcat=document.getElementById('f-sc').value;
  const date=document.getElementById('f-d').value.trim(),exc=document.getElementById('f-e').value.trim();
  const body=document.getElementById('f-b').value.trim();
  if(!title||!catKey||!body){alert('Title, Category, and Body are required.');return}
  const previous=editId?POSTS.find(x=>x.id===editId):null;
  const post={...(previous||{}),id:editId||Date.now(),title,lang:langV,lc:LC[langV]||'kn',cat:CATS[catKey].label,cc:catKey,subcat:subcat||'',date:date||todayStr(),exc:exc||autoExc(body),body};
  if(previous?.html&&body!==previous.body)post.html=bodyToRichHtml(body);
  try{
    await svP(post);
    if(editId){const i=POSTS.findIndex(x=>x.id===editId);if(i>=0)POSTS[i]=post}else POSTS.unshift(post);
    cancelForm();renderAdPosts();renderHome();
  }catch(e){console.error('Post save failed:',e);alert('The post could not be saved. Please try again.')}
}

// ── ADMIN: CATEGORIES ─────────────────────────────────
function renderAdCats(){
  document.getElementById('cw').innerHTML=Object.keys(CATS).map(k=>`<div class="catgroup">
    <div class="catgroup-head" id="ch-${k}">
      ${ICONS[k]||'✦'} ${esc(CATS[k].label)}
      <button onclick="startRename('${k}')" style="padding:3px 11px;background:transparent;border:1px solid var(--gd);border-radius:12px;cursor:pointer;font-size:.75rem;color:var(--il);font-family:'Lora',serif">✏ Rename</button>
    </div>
    <div class="subt">${CATS[k].subs.map((s,i)=>`<span class="stag">${esc(s)}<span class="x" onclick="delSub('${k}',${i})"> ×</span></span>`).join('')}</div>
    <div class="addsubrow"><input type="text" id="ns-${k}" placeholder="Add sub-category..."><button class="addsubbtn" onclick="addSub('${k}')">+ Add</button></div>
  </div>`).join('')
}
function startRename(k){
  const el=document.getElementById('ch-'+k);if(!el)return;
  el.innerHTML=`${ICONS[k]||'✦'} <input type="text" id="rn-${k}" value="${esc(CATS[k].label)}" style="padding:5px 10px;border:1px solid var(--ac);border-radius:6px;font-family:'Lora','Noto Sans Kannada',serif;font-size:.9rem;background:var(--p);color:var(--ink);margin:0 8px;width:min(220px,50%)" onkeydown="if(event.key==='Enter')saveRename('${k}');if(event.key==='Escape')renderAdCats()">
    <button onclick="saveRename('${k}')" style="padding:4px 14px;background:#2d6a2d;color:#fff;border:none;border-radius:12px;cursor:pointer;font-family:'Lora',serif;font-size:.8rem">Save</button>
    <button onclick="renderAdCats()" style="padding:4px 11px;background:transparent;border:1px solid var(--gd);border-radius:12px;cursor:pointer;font-family:'Lora',serif;font-size:.8rem;color:var(--il);margin-left:4px">Cancel</button>`;
  document.getElementById('rn-'+k)?.select()
}
async function saveRename(k){
  const v=document.getElementById('rn-'+k)?.value.trim();if(!v)return;
  CATS[k].label=v;POSTS.forEach(p=>{if(p.cc===k)p.cat=v});
  try{await svC();await Promise.all(POSTS.filter(p=>p.cc===k).map(svP));renderAdCats();renderHome()}
  catch(e){console.error('Category rename failed:',e);alert('The category could not be saved. Please try again.')}
}
async function addSub(k){
  const inp=document.getElementById('ns-'+k),v=inp.value.trim();
  if(!v||CATS[k].subs.includes(v))return;
  CATS[k].subs.push(v);try{await svC();inp.value='';renderAdCats();renderHome()}catch(e){CATS[k].subs.pop();console.error('Category save failed:',e);alert('The category could not be saved. Please try again.')}
}
async function delSub(k,i){const removed=CATS[k].subs.splice(i,1);try{await svC();renderAdCats();renderHome()}catch(e){CATS[k].subs.splice(i,0,...removed);console.error('Category save failed:',e);alert('The category could not be saved. Please try again.')}
}
async function addMainCat(){
  const inp=document.getElementById('nci'),v=inp.value.trim();if(!v)return;
  const key=v.toLowerCase().replace(/[^\w]/g,'_').replace(/_+/g,'_').substring(0,24)||'cat_'+Date.now();
  if(CATS[key])return;CATS[key]={label:v,subs:['Other']};try{await svC();inp.value='';renderAdCats();renderHome()}catch(e){delete CATS[key];console.error('Category save failed:',e);alert('The category could not be saved. Please try again.')}
}

// ── ADMIN: QUIZ ───────────────────────────────────────
function renderAdQuiz(){
  const el=document.getElementById('atab-quiz');
  const badge=Q?({upcoming:'<span class="badge bup">Upcoming</span>',live:'<span class="badge blive">Live</span>',closed:'<span class="badge bcl">Closed</span>'}[Q.state]||''):'<span class="badge bno">No active quiz</span>';
  let statusHtml=`<div class="qstatus">
    <div class="qstatus-head"><h4>${Q?esc(Q.title):'Quiz Status'}</h4>${badge}${Q?`<span style="font-size:.74rem;color:var(--gd)">${Q.type==='prize'?'🎁 Prize':'📜 Certificate'} · ${Q.questions?.length||0} Qs</span>`:''}</div>
    ${Q?`<div class="qacts">
      <button class="editbtn" onclick="startEditQuiz()">Edit</button>
      ${Q.state==='upcoming'?`<button class="qa qa-go" onclick="setQState('live')">▶ Go Live</button>`:''}
      ${Q.state==='live'?`<button class="qa qa-cl" onclick="setQState('closed')">■ Close Quiz</button>`:''}
      ${Q.state==='closed'?`<button class="qa qa-arc" onclick="doArchive()">Archive Quiz</button><button class="qa qa-sub" onclick="viewSubs()">📋 Submissions (${QS.length})</button>`:''}
      <button class="delbtn" onclick="askDelQ()">Delete</button>
    </div>`:`<button class="addbtn" style="margin-bottom:0;margin-top:10px" onclick="startCreateQuiz()">+ Create Quiz</button>`}
  </div>`;
  el.innerHTML=statusHtml+'<div id="qfw"></div><div id="qsv"></div><div id="qsubs"></div>'+
    `<div style="margin-top:28px"><h4 style="font-family:'Playfair Display',serif;color:var(--ac);margin-bottom:14px;font-size:1rem">Archive (${QA.length})</h4>
    ${QA.length?QA.map(q=>`<div class="apost">
      <div class="apost-info"><div class="apost-title">${esc(q.title)}</div><div class="apost-meta">${q.date} · ${q.total} participants</div></div>
      <div class="apost-acts"><button class="delbtn" onclick="delArcQ(${q.id})">Delete</button></div>
    </div>`).join(''):'<div class="empty" style="padding:14px">No archived quizzes yet.</div>'}
    </div>`
}
async function setQState(s){
  if(!Q)return;
  const old=Q.state;Q.state=s;
  try{await svQ();renderAdQuiz()}catch(e){Q.state=old;console.error('Quiz save failed:',e);alert('The quiz state could not be saved. Please try again.')}
}
async function doArchive(){
  if(!Q||Q.state!=='closed')return;
  const archive={id:Q.id,title:Q.title,date:Q.date,type:Q.type,total:Q.stats?.total||0,state:'archived',
    questions:Q.questions.map((qu,i)=>({...qu,stats:Q.stats?.qs?.[i]||{c:0,w:0}}))};
  try{
    await window.saveFirestoreQuizArchive(archive);
    Q=null;QS=[];await svQ();QA.unshift(archive);renderAdQuiz();
  }catch(e){console.error('Quiz archive failed:',e);alert('The quiz could not be archived. Please try again.')}
}
function askDelQ(){
  const sv=document.getElementById('qsv');
  sv.innerHTML=`<div class="apost" style="border-color:#e8a9a0;margin-top:8px">
    <span style="font-size:.88rem;color:var(--il)">Delete this quiz permanently?</span>
    <div class="apost-acts">
      <button class="delbtn hot" onclick="delQ()">Yes, delete</button>
      <button class="cancelbtn" style="padding:5px 10px;font-size:.8rem" onclick="document.getElementById('qsv').innerHTML=''">Cancel</button>
    </div>
  </div>`
}
async function delQ(){
  const current=Q;Q=null;QS=[];
  try{await svQ();renderAdQuiz()}catch(e){Q=current;console.error('Quiz deletion failed:',e);alert('The quiz could not be deleted. Please try again.')}
}
function viewSubs(){
  const el=document.getElementById('qsubs');
  if(!QS.length){el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">No submissions yet.</p>';return}
  el.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
    <h4 style="font-family:'Playfair Display',serif;color:var(--ac);font-size:1rem">Submissions (${QS.length})</h4>
    <button class="delbtn" onclick="clearSubs()">Clear All</button>
  </div>
  <div class="subslist">${QS.map(s=>`<div class="subrow">
    <strong>${esc(s.name||'—')}</strong>${s.con?' · '+esc(s.con):''} · Score: <strong>${s.score}/${s.total}</strong> · ${s.time}
  </div>`).join('')}</div>`
}
async function clearSubs(){QS=[];await svQS();viewSubs()}
async function delArcQ(id){
  try{await window.deleteFirestoreQuizArchive(id);QA=QA.filter(q=>q.id!==id);renderAdQuiz()}
  catch(e){console.error('Quiz archive deletion failed:',e);alert('The archived quiz could not be deleted. Please try again.')}
}

// ── QUIZ FORM (Admin) ─────────────────────────────────
function renderQBuilder(){
  const c=document.getElementById('qbuilder');if(!c)return;
  if(!qDraft.length){c.innerHTML='<p style="text-align:center;color:var(--gd);font-style:italic;padding:14px;font-size:.85rem">No questions yet. Click "+ Add Question".</p>';return}
  c.innerHTML=qDraft.map((q,i)=>`<div class="qqbuilder">
    <button class="qqrm" onclick="removeQ(${i})">×</button>
    <div class="qqnum">Question ${i+1}</div>
    <textarea id="qq-t-${i}" rows="2" placeholder="Question text..."></textarea>
    <div style="font-size:.75rem;color:var(--il);margin-bottom:6px;font-style:italic">Options — mark ○ for correct answer:</div>
    <div class="qog">${[0,1,2,3].map(j=>`<div class="qor">
      <input type="radio" name="qa-${i}" value="${j}" title="Mark correct">
      <input type="text" id="qq-o-${i}-${j}" placeholder="${String.fromCharCode(65+j)}...">
    </div>`).join('')}</div>
    <textarea id="qq-e-${i}" rows="2" placeholder="Explanation (shown after quiz)..."></textarea>
  </div>`).join('')
  // Set values after render
  qDraft.forEach((q,i)=>{
    const t=document.getElementById(`qq-t-${i}`);if(t)t.value=q.q||'';
    const e=document.getElementById(`qq-e-${i}`);if(e)e.value=q.exp||'';
    ;[0,1,2,3].forEach(j=>{const o=document.getElementById(`qq-o-${i}-${j}`);if(o)o.value=q.opts?.[j]||''});
    const r=document.querySelector(`input[name="qa-${i}"][value="${q.ans??0}"]`);if(r)r.checked=true
  })
}
function syncQD(){
  qDraft=qDraft.map((q,i)=>({
    q:document.getElementById(`qq-t-${i}`)?.value.trim()||'',
    opts:[0,1,2,3].map(j=>document.getElementById(`qq-o-${i}-${j}`)?.value.trim()||''),
    ans:parseInt(document.querySelector(`input[name="qa-${i}"]:checked`)?.value??q.ans??0),
    exp:document.getElementById(`qq-e-${i}`)?.value.trim()||''
  }))
}
function addQ(){syncQD();qDraft.push({q:'',opts:['','','',''],ans:0,exp:''});renderQBuilder();document.querySelectorAll('.qqbuilder').at(-1)?.scrollIntoView({behavior:'smooth',block:'start'})}
function removeQ(i){syncQD();qDraft.splice(i,1);renderQBuilder()}
function buildQForm(){
  const q=editQId?Q:null;
  const catOpts=Object.keys(CATS).map(k=>`<option value="${k}"${q&&q.cc===k?' selected':''}>${esc(CATS[k].label)}</option>`).join('');
  return`<div class="aform"><h3>${q?'Edit Quiz':'Create New Quiz'}</h3>
    <div class="frow"><label>Quiz Title</label><input type="text" id="qf-t" placeholder="e.g. ಕನ್ನಡ ಸಾಹಿತ್ಯ ರಸಪ್ರಶ್ನೆ"></div>
    <div class="frow"><label>Description / Announcement</label><textarea id="qf-d" rows="3" placeholder="Describe the quiz, topics, rules..."></textarea></div>
    <div class="frow2">
      <div class="frow"><label>Type</label><select id="qf-type">
        <option value="certificate">📜 Certificate Quiz</option>
        <option value="prize"${q?.type==='prize'?' selected':''}>🎁 Prize Quiz</option>
      </select></div>
      <div class="frow"><label>State</label><select id="qf-state">
        <option value="upcoming">Upcoming</option>
        <option value="live"${q?.state==='live'?' selected':''}>Live</option>
        <option value="closed"${q?.state==='closed'?' selected':''}>Closed</option>
      </select></div>
    </div>
    <div class="frow2">
      <div class="frow"><label>Date (display)</label><input type="text" id="qf-date" placeholder="e.g. 15 Jun 2025"></div>
      <div class="frow"><label>Deadline (display)</label><input type="text" id="qf-dl" placeholder="e.g. 20 Jun 2025, 11:59 PM"></div>
    </div>
    <div class="frow"><label>Prize Details <span style="font-weight:400;color:var(--gd)">(for prize quiz)</span></label><textarea id="qf-pr" rows="2" placeholder="e.g. Top 3 scorers win a signed book..."></textarea></div>
    <div style="margin-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <label style="font-size:.82rem;color:var(--il);font-family:'Lora',serif;font-weight:600">Questions</label>
        <button class="editbtn" onclick="addQ()">+ Add Question</button>
      </div>
      <div id="qbuilder"></div>
    </div>
    <div class="fbts"><button class="savebtn" onclick="saveQForm()">💾 Save Quiz</button><button class="cancelbtn" onclick="cancelQF()">Cancel</button></div>
  </div>`
}
function startCreateQuiz(){
  editQId=false;qDraft=[];
  document.getElementById('qfw').innerHTML=buildQForm();
  document.getElementById('qf-date').value=todayStr();
  renderQBuilder();document.getElementById('qfw').scrollIntoView({behavior:'smooth',block:'start'})
}
function startEditQuiz(){
  if(!Q)return;editQId=true;
  qDraft=Q.questions?JSON.parse(JSON.stringify(Q.questions)):[];
  document.getElementById('qfw').innerHTML=buildQForm();
  document.getElementById('qf-t').value=Q.title||'';
  document.getElementById('qf-d').value=Q.description||'';
  document.getElementById('qf-type').value=Q.type||'certificate';
  document.getElementById('qf-state').value=Q.state||'upcoming';
  document.getElementById('qf-date').value=Q.date||'';
  document.getElementById('qf-dl').value=Q.deadline||'';
  document.getElementById('qf-pr').value=Q.prize||'';
  renderQBuilder();document.getElementById('qfw').scrollIntoView({behavior:'smooth',block:'start'})
}
function cancelQF(){document.getElementById('qfw').innerHTML='';document.getElementById('qsubs').innerHTML='';editQId=false;qDraft=[]}
async function saveQForm(){
  syncQD();
  const title=document.getElementById('qf-t')?.value.trim();
  if(!title){alert('Please enter a quiz title.');return}
  if(!qDraft.length){alert('Please add at least one question.');return}
  for(let i=0;i<qDraft.length;i++){
    if(!qDraft[i].q){alert(`Question ${i+1} has no text.`);return}
    if(qDraft[i].opts.filter(o=>o).length<2){alert(`Question ${i+1} needs at least 2 options.`);return}
  }
  Q={
    id:editQId&&Q?Q.id:Date.now(),
    title,description:document.getElementById('qf-d')?.value.trim()||'',
    type:document.getElementById('qf-type')?.value||'certificate',
    state:document.getElementById('qf-state')?.value||'upcoming',
    date:document.getElementById('qf-date')?.value.trim()||'',
    deadline:document.getElementById('qf-dl')?.value.trim()||'',
    prize:document.getElementById('qf-pr')?.value.trim()||'',
    questions:qDraft,stats:editQId&&Q?Q.stats:{total:0,qs:{}}
  };
  try{await svQ();cancelQF();renderAdQuiz()}catch(e){console.error('Quiz save failed:',e);alert('The quiz could not be saved. Please try again.')}
}

(async()=>{
  // Do not make visitors wait for Firebase before they can read the site.
  go('home');
  try{
    await window.firebaseReady;
    await loadAll();
  }catch(e){
    console.error('Firebase refresh failed:',e);
  }
})();

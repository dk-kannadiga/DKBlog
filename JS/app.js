// ── BLOG DATA ─────────────────────────────────────────

const ICONS={poem:'🌸',story:'📖',article:'✒️',other:'✦'};
const LC={'ಕನ್ನಡ':'kn','English':'en','Mixed':'mixed'};

// Always wait for the current Firestore result before showing published content.
// The bundled sample posts are only used if Firestore is unavailable.
let POSTS=[],COLLECTIONS=[],BOOKS=[],postsLoading=true,collectionsLoading=true,libraryLoading=true,contentLoading=true,CATS=JSON.parse(JSON.stringify(DC)),likes={},likedMe=new Set();
let Q=null,QA=[...DQA],qDraft=[],editQId=false,certDraft=null,qSubmitted=false,qSubmissionQuizId=null,qSubmissionCheckInFlight=false,qSubmitting=false;
let adminAuth=false,editId=null,collectionEditId=null,bookEditId=null,catF='all',searchQ='',librarySearchQ='',libraryAvailability='all',libraryRequests=[],libraryAdminLoading=false,participantStatus=null,participantSort={field:'score',direction:'desc'};
const HOME_PAGE_SIZE=12;
let postsFullyLoaded=false,homeHasMore=false,homeLoadingMore=false,homeVisibleCount=0,allPostsPromise=null;

function hSearch(v){
  searchQ=v.toLowerCase().trim();
  const clr=document.getElementById('sclr');
  if(clr)clr.style.display=searchQ?'':'none';
  if(searchQ&&!postsFullyLoaded)ensureAllPosts().then(()=>renderHome()).catch(e=>console.error('Full search load failed:',e));
  renderHome()
}
function clearSearch(){
  searchQ='';
  const inp=document.getElementById('sinp');if(inp)inp.value='';
  const clr=document.getElementById('sclr');if(clr)clr.style.display='none';
  renderHome()
}

async function loadAll(){
  const [posts,categories,activeQuiz,archive,collections,libraryBooks] = await Promise.allSettled([
    window.getFirestorePostsPage?window.getFirestorePostsPage(true):window.getFirestorePosts?window.getFirestorePosts():Promise.resolve([...DP]),
    window.getFirestoreCategories?window.getFirestoreCategories():Promise.resolve(JSON.parse(JSON.stringify(DC))),
    window.getFirestoreActiveQuiz?window.getFirestoreActiveQuiz():Promise.resolve(null),
    window.getFirestoreQuizzes?window.getFirestoreQuizzes():Promise.resolve([...DQA]),
    window.getFirestoreCollections?window.getFirestoreCollections():Promise.resolve([]),
    window.getFirestoreLibraryBooks?window.getFirestoreLibraryBooks():Promise.resolve([])
  ]);

  if(posts.status==='fulfilled'){
    const result=posts.value;
    if(Array.isArray(result)){
      POSTS=result;
      postsFullyLoaded=true;
      homeHasMore=false;
    }else{
      POSTS=Array.isArray(result.posts)?result.posts:[];
      homeHasMore=Boolean(result.hasMore);
      postsFullyLoaded=!homeHasMore;
    }
    homeVisibleCount=POSTS.length;
  }else{
    console.error('Posts load failed:',posts.reason);
    if(!POSTS.length)POSTS=[...DP];
    postsFullyLoaded=true;
    homeHasMore=false;
    homeVisibleCount=POSTS.length;
  }
  postsLoading=false;
  contentLoading=false;
  if(categories.status==='fulfilled'&&categories.value)CATS=categories.value;
  else if(categories.status==='rejected')console.error('Categories load failed:',categories.reason);
  if(activeQuiz.status==='fulfilled')Q=activeQuiz.value||null;
  else console.error('Active quiz load failed:',activeQuiz.reason);
  if(archive.status==='fulfilled')QA=archive.value.filter(q=>q.state==='archived'&&Array.isArray(q.questions));
  else console.error('Quiz archive load failed:',archive.reason);
  if(collections.status==='fulfilled'){COLLECTIONS=collections.value}
  else console.error('Collections load failed:',collections.reason);
  collectionsLoading=false;
  if(libraryBooks.status==='fulfilled')BOOKS=libraryBooks.value;
  else console.error('Library load failed:',libraryBooks.reason);
  libraryLoading=false;

  // Show the Firestore content as soon as it arrives. Likes are deliberately
  // loaded afterward because they require the anonymous visitor session.
  openCurrentRoute();
  try{
    likes={};likedMe=new Set();
    await loadPostReactions(POSTS);
    renderHome();
  }catch(e){console.error('Reactions load failed:',e)}
}
async function loadPostReactions(posts){
  await Promise.all(posts.filter(p=>!(p.id in likes)).map(async p=>{
    likes[p.id]=await window.getFirestoreLikes(p.id);
    if(await window.getMyFirestoreLike(p.id))likedMe.add(p.id);
  }));
}
async function ensureAllPosts(){
  if(postsFullyLoaded)return POSTS;
  if(!allPostsPromise){
    allPostsPromise=(async()=>{
      if(!window.getFirestorePosts){
        postsFullyLoaded=true;
        homeHasMore=false;
        return POSTS;
      }
      const all=await window.getFirestorePosts();
      POSTS=all;
      postsFullyLoaded=true;
      homeHasMore=false;
      return POSTS;
    })();
  }
  try{return await allPostsPromise}
  finally{allPostsPromise=null}
}
async function loadMorePosts(){
  if(homeLoadingMore)return;
  if(postsFullyLoaded){
    homeVisibleCount=Math.min(homeVisibleCount+HOME_PAGE_SIZE,POSTS.length);
    renderHome();
    return;
  }
  if(!homeHasMore||!window.getFirestorePostsPage)return;
  homeLoadingMore=true;
  renderHome();
  try{
    const result=await window.getFirestorePostsPage();
    const seen=new Set(POSTS.map(post=>String(post.id)));
    const added=(result.posts||[]).filter(post=>!seen.has(String(post.id)));
    POSTS=[...POSTS,...added].sort((a,b)=>Number(b.id||0)-Number(a.id||0));
    homeVisibleCount+=added.length;
    homeHasMore=Boolean(result.hasMore);
    if(!homeHasMore)postsFullyLoaded=true;
    await loadPostReactions(added);
  }catch(e){
    console.error('More posts load failed:',e);
    alert('ಹಳೆಯ ಬರಹಗಳನ್ನು ತರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
  }finally{
    homeLoadingMore=false;
    renderHome();
  }
}
async function ensurePostLoaded(id){
  let post=findPost(id);
  if(post)return post;
  if(window.getFirestorePostById){
    post=await window.getFirestorePostById(id);
    if(post){
      POSTS=[...POSTS,post].sort((a,b)=>Number(b.id||0)-Number(a.id||0));
      await loadPostReactions([post]);
      return post;
    }
  }
  if(!postsFullyLoaded){
    await ensureAllPosts();
    return findPost(id);
  }
  return null;
}
const svP=(post)=>window.saveFirestorePost(post);
const svC=()=>window.saveFirestoreCategories(CATS);
const svCol=(collection)=>window.saveFirestoreCollection(collection);
const svQ=()=>window.saveFirestoreActiveQuiz(Q);
const svQA=()=>Promise.resolve();
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
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function autoExc(b){if(!b)return'';if(b.length<=160)return b;const t=b.substring(0,160);const i=Math.max(t.lastIndexOf(' '),t.lastIndexOf('\n'));return t.substring(0,i>80?i:140)+'...'}
function postTags(p){
  const labels=Array.isArray(p.labels)?[...new Set(p.labels.map(x=>String(x).trim()).filter(Boolean))]:[];
  const extraLabels=labels.filter(label=>label!==p.subcat);
  const collection=findCollection(p.collectionId);
  return `<div class="tags"><span class="tcat">${esc(p.cat)}</span>${p.subcat?`<span class="tsub">${esc(p.subcat)}</span>`:''}${extraLabels.map(label=>`<span class="tlabel">${esc(label)}</span>`).join('')}${collection?`<span class="tcollection">${esc(collection.icon||'✦')} ${esc(collection.title)}</span>`:''}</div>`
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
  const allowed=new Set(['a','b','blockquote','br','code','div','em','h2','h3','h4','i','img','li','ol','p','pre','span','strong','u','ul']);
  const blocked=new Set(['base','embed','form','iframe','link','meta','object','script','style','svg']);
  for(const el of Array.from(template.content.querySelectorAll('*')).reverse()){
    const tag=el.tagName.toLowerCase();
    if(blocked.has(tag)){el.remove();continue}
    if(!allowed.has(tag)){el.replaceWith(...Array.from(el.childNodes));continue}
    const href=tag==='a'?safeContentUrl(el.getAttribute('href')):'';
    const src=tag==='img'?safeContentUrl(el.getAttribute('src')):'';
    const alt=tag==='img'?(el.getAttribute('alt')||''):'';
    const sizeClass=tag==='span'&&['rt-size-small','rt-size-large'].includes(el.getAttribute('class')||'')?el.getAttribute('class'):'';
    for(const attr of Array.from(el.attributes))el.removeAttribute(attr.name);
    if(tag==='a'&&href){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}
    if(tag==='img'){
      if(!src){el.remove();continue}
      el.setAttribute('src',src);if(alt)el.setAttribute('alt',alt)
    }
    if(sizeClass)el.setAttribute('class',sizeClass);
  }
  return template.innerHTML;
}
function postContent(p){
  const cover=safeContentUrl(p.coverImage);
  const coverHtml=cover?`<img class="post-cover" src="${cover}" alt="" onerror="this.remove()">`:'';
  return p.html?coverHtml+safePostHtml(p.html):esc(p.body)
}
function bodyToRichHtml(body){
  return String(body).split(/\n{2,}/).filter(Boolean).map(paragraph=>`<p>${esc(paragraph).replace(/\n/g,'<br>')}</p>`).join('')
}
function todayStr(){return new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}

// ── NAVIGATION ────────────────────────────────────────
function routePath(page,id){
  if(page==='post'&&id!==undefined&&id!==null)return `/post/${encodeURIComponent(String(id))}`;
  if(page==='book'&&id!==undefined&&id!==null)return `/library/book/${encodeURIComponent(String(id))}`;
  if(page==='qdetail'&&id!==undefined&&id!==null)return `/quiz/${encodeURIComponent(String(id))}`;
  if(page==='qplay'&&id!==undefined&&id!==null)return `/quiz/${encodeURIComponent(String(id))}`;
  if(page==='collection'&&id!==undefined&&id!==null)return `/collection/${encodeURIComponent(String(id))}`;
  if(page==='library')return '/library';
  if(page==='collections')return '/collections';
  if(page==='index')return '/index';
  if(page==='about')return '/about';
  if(page==='quiz'||page==='cert')return '/quiz';
  if(page==='admin'||page==='adminlogin')return '/admin';
  return '/';
}
function routeFromLocation(){
  const legacy=location.hash.match(/^#(post|quiz)-(.+)$/);
  if(legacy)return {page:legacy[1]==='post'?'post':'qdetail',id:decodeURIComponent(legacy[2])};
  const parts=location.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part));
  if(parts[0]==='post'&&parts[1])return {page:'post',id:parts[1]};
  if(parts[0]==='library'&&parts[1]==='book'&&parts[2])return {page:'book',id:parts[2]};
  if(parts[0]==='quiz'&&parts[1])return {page:'qdetail',id:parts[1]};
  if(parts[0]==='collection'&&parts[1])return {page:'collection',id:parts[1]};
  if(parts[0]==='library')return {page:'library'};
  if(parts[0]==='quiz')return {page:'quiz'};
  if(parts[0]==='collections')return {page:'collections'};
  if(parts[0]==='index')return {page:'index'};
  if(parts[0]==='about')return {page:'about'};
  if(parts[0]==='admin')return {page:'adminlogin'};
  return {page:'home'};
}
function syncRoute(page,id,replace=false){
  const path=routePath(page,id);
  if(location.pathname===path&&!location.hash)return;
  history[replace?'replaceState':'pushState']({},'',path);
}
function openCurrentRoute(){
  const {page,id}=routeFromLocation();
  go(page,id,{sync:false});
}
function findPost(id){return POSTS.find(post=>String(post.id)===String(id))}
function findQuiz(id){return QA.find(quiz=>String(quiz.id)===String(id))}
function findCollection(id){return COLLECTIONS.find(collection=>String(collection.id)===String(id))}
function findBook(id){return BOOKS.find(book=>String(book.id)===String(id))}
function collectionPosts(id){
  const position=post=>Number(post.collectionOrder)>0?Number(post.collectionOrder):Number(post.id)||0;
  return POSTS.filter(post=>String(post.collectionId||'')===String(id)).sort((a,b)=>position(a)-position(b)||Number(a.id)-Number(b.id));
}
function go(page,id,{sync=true,replace=false}={}){
  if(page==='admin'&&!adminAuth){go('adminlogin',null,{sync,replace});return}
  if(page==='qdetail'&&Q&&String(Q.id)===String(id))page='qplay';
  if(sync)syncRoute(page,id,replace);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('nav a').forEach(a=>a.classList.remove('on'));
  const map={home:'ph',post:'pp',index:'pidx',collections:'pcols',collection:'pcol',library:'plib',book:'pbook',about:'pab',adminlogin:'pal',admin:'pad',quiz:'pq',qplay:'pqp',qdetail:'pqd',cert:'pcert'};
  document.getElementById(map[page])?.classList.add('on');
  if(page==='home'){document.getElementById('nh').classList.add('on');renderHome()}
  else if(page==='post'&&id)renderPost(id);
  else if(page==='index'){document.getElementById('ni').classList.add('on');renderIdx()}
  else if(page==='collections'){document.getElementById('nc').classList.add('on');renderCollections()}
  else if(page==='collection'&&id){document.getElementById('nc').classList.add('on');renderCollection(id)}
  else if(page==='library'){document.getElementById('nl').classList.add('on');renderLibrary()}
  else if(page==='book'&&id){document.getElementById('nl').classList.add('on');renderLibraryBook(id)}
  else if(page==='about')document.getElementById('na').classList.add('on');
  else if(page==='admin'){if(!adminAuth){go('adminlogin');return}renderAdmin()}
  else if(page==='quiz'){document.getElementById('nq').classList.add('on');renderQuiz()}
  else if(page==='qplay'&&id){document.getElementById('nq').classList.add('on');renderQuizPlay(id)}
  else if(page==='qdetail'&&id)renderQDetail(id);
  window.scrollTo(0,0)
}
window.addEventListener('popstate',openCurrentRoute);
window.addEventListener('hashchange',openCurrentRoute);

// ── BLOG FILTERS ──────────────────────────────────────
function cf(btn,v){catF=v;document.querySelectorAll('.fb.cat').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderHome()}
function renderCatFilters(){
  let h=`<button class="fb cat${catF==='all'?' on':''}" onclick="cf(this,'all')">ಎಲ್ಲವೂ</button>`;
  Object.keys(CATS).forEach(k=>h+=`<button class="fb cat${catF===k?' on':''}" onclick="cf(this,'${k}')">${esc(CATS[k].label)}</button>`);
  document.getElementById('filters').innerHTML=h
}

// ── BLOG RENDER ───────────────────────────────────────
function renderHome(){
  renderCatFilters();
  const g=document.getElementById('grid'),sr=document.getElementById('sres');
  if(postsLoading){g.innerHTML='<div class="empty">ಬರಹಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';if(sr)sr.textContent='';return}
  let fp=POSTS.filter(p=>catF==='all'||p.cc===catF);
  if(searchQ){
    fp=fp.filter(p=>
      p.title.toLowerCase().includes(searchQ)||
      p.body.toLowerCase().includes(searchQ)||
      p.cat.toLowerCase().includes(searchQ)||
      (p.subcat&&p.subcat.toLowerCase().includes(searchQ))||
      (Array.isArray(p.labels)&&p.labels.some(label=>String(label).toLowerCase().includes(searchQ)))||
      p.lang.toLowerCase().includes(searchQ)
    );
    if(sr)sr.textContent=!postsFullyLoaded
      ?'ಎಲ್ಲ ಬರಹಗಳಲ್ಲಿ ಹುಡುಕಲಾಗುತ್ತಿದೆ...'
      :fp.length
      ?`"${searchQ}" ಹುಡುಕಾಟಕ್ಕೆ ${fp.length} ಫಲಿತಾಂಶ${fp.length!==1?'ಗಳು':''}`
      :`"${searchQ}" ಹುಡುಕಾಟಕ್ಕೆ ಯಾವುದೇ ಬರಹ ಸಿಗಲಿಲ್ಲ`;
  }else{if(sr)sr.textContent=''}
  const shown=searchQ?fp:fp.slice(0,homeVisibleCount);
  const moreAvailable=!searchQ&&(postsFullyLoaded?fp.length>shown.length:homeHasMore);
  if(!shown.length){
    g.innerHTML=`<div class="empty">${searchQ?'ಹೊಂದಿಕೆಯಾಗುವ ಬರಹಗಳಿಲ್ಲ.':'ಈ ವಿಭಾಗಕ್ಕೆ ಹೊಂದಿಕೆಯಾಗುವ ಬರಹಗಳಿಲ್ಲ.'}${moreAvailable?'<br><button class="loadmore-btn" onclick="loadMorePosts()">ಹಳೆಯ ಬರಹಗಳನ್ನು ತೋರಿಸಿ</button>':''}</div>`;
    return;
  }
  g.innerHTML=shown.map(p=>`<div class="card" onclick="go('post',${p.id})">
    ${postTags(p)}
    <h2>${esc(p.title)}</h2><p class="exc">${esc(p.exc||autoExc(p.body))}</p>
    <div class="cf"><span>${p.date}</span><span>♥ ${likes[p.id]||0}</span></div>
  </div>`).join('')+(moreAvailable?`<div class="loadmore"><button class="loadmore-btn" onclick="loadMorePosts()"${homeLoadingMore?' disabled':''}>${homeLoadingMore?'ಹಳೆಯ ಬರಹಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...':'ಹಳೆಯ ಬರಹಗಳನ್ನು ತೋರಿಸಿ'}</button></div>`:'')
}
async function renderPost(id){
  let p=findPost(id),el=document.getElementById('pvc');
  if(!p){
    if(contentLoading){
      el.innerHTML='<div class="empty">ಬರಹವನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
      return;
    }
    el.innerHTML='<div class="empty">ಬರಹವನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
    try{p=await ensurePostLoaded(id)}
    catch(e){console.error('Writing load failed:',e)}
    if(!p){
      el.innerHTML='<div class="empty">ಈ ಬರಹ ಸಿಗಲಿಲ್ಲ.</div>';
      return;
    }
  }
  if(!(p.id in likes)){
    try{await loadPostReactions([p])}catch(e){console.error('Writing reactions load failed:',e)}
  }
  const lc=likes[p.id]||0,il=likedMe.has(p.id),cmts=await ldCmt(p.id),collectionNavigation=collectionReadingNav(p);
  const ch=cmts.length?cmts.map(c=>`<div class="ci"><div class="chdr"><span class="cauth">${esc(c.name||'ಅನಾಮಧೇಯ')}</span><span class="cdate">${c.date}</span></div><p class="ctxt">${esc(c.txt)}</p></div>`).join(''):'<div class="noc">ಮೊದಲ ಪ್ರತಿಕ್ರಿಯೆ ನಿಮ್ಮದಾಗಲಿ...</div>';
  el.innerHTML=`<div class="pvh">
    ${postTags(p)}
    <h1>${esc(p.title)}</h1><p class="pmeta">ಬರೆದ ದಿನ: ${p.date}</p></div>
    <div class="pbody${p.cc==='poem'?' poem':''}${p.html?' richbody':''}">${postContent(p)}</div>
    <div class="div">✦</div>
    <div class="pactions">
      <button class="lbtn${il?' liked':''}" id="lb${p.id}" onclick="tlike(${p.id})">${il?'♥':'♡'} <span id="lc${p.id}">${lc}</span> ${lc===1?'ಮೆಚ್ಚುಗೆ':'ಮೆಚ್ಚುಗೆಗಳು'}</button>
      <button class="sbtn" onclick="shr(${p.id})">↗ ಹಂಚಿಕೊಳ್ಳಿ</button>
      <span class="stoast" id="st${p.id}">ಕೊಂಡಿಯನ್ನು ನಕಲಿಸಲಾಗಿದೆ!</span>
    </div>
    <div class="cs"><h3>ಅಭಿಪ್ರಾಯಗಳು ಮತ್ತು ಪ್ರತಿಕ್ರಿಯೆಗಳು</h3>
      <div class="cform">
        <input type="text" id="cn${p.id}" placeholder="ನಿಮ್ಮ ಹೆಸರು (ಅನಾಮಧೇಯವಾಗಿರಲು ಖಾಲಿ ಬಿಡಿ)" maxlength="60">
        <textarea id="ct${p.id}" rows="3" placeholder="ನಿಮ್ಮ ಅನಿಸಿಕೆಗಳನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ..."></textarea>
        <button class="csub" onclick="addCmt(${p.id})">ಪ್ರತಿಕ್ರಿಯೆ ಪ್ರಕಟಿಸಿ</button>
      </div>
      <div class="clist" id="cl${p.id}">${ch}</div>
    </div>
    <div class="div" style="margin-top:36px">✦ ✦ ✦</div>
    ${collectionNavigation}
    <div class="pnav">
      <button class="back" onclick="go('home')">← ಎಲ್ಲ ಬರಹಗಳು</button>
      <button class="back" onclick="go('index')">☰ ಪಟ್ಟಿ</button>
      <button class="back" onclick="go('about')">✍ ನನ್ನ ಬಗ್ಗೆ</button>
    </div>`
}
async function tlike(id){
  const next=!likedMe.has(id);
  try{await window.toggleFirestoreLike(id,next)}catch(e){console.error('Reaction failed:',e);alert('ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');return}
  if(next){likedMe.add(id);likes[id]=(likes[id]||0)+1}
  else{likedMe.delete(id);likes[id]=Math.max(0,(likes[id]||0)-1)}

  const il=likedMe.has(id),
        lc=likes[id]||0,
        btn=document.getElementById('lb'+id);

  if(btn){
    btn.className='lbtn'+(il?' liked':'');
    btn.innerHTML=`${il?'♥':'♡'} <span id="lc${id}">${lc}</span> ${lc===1?'ಮೆಚ್ಚುಗೆ':'ಮೆಚ್ಚುಗೆಗಳು'}`;
  }
}
function shr(id){
  const p=findPost(id),t=document.getElementById('st'+id),url=new URL(routePath('post',id),location.origin).href;
  if(navigator.share)navigator.share({title:p?.title||'',text:'ಡೀಕೆಯ ಒಂದು ಬರಹ',url}).catch(()=>{});
  else{try{navigator.clipboard.writeText(url)}catch(e){}if(t){t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}}
}
async function addCmt(id){
  const n=document.getElementById('cn'+id),t=document.getElementById('ct'+id);
  if(!t?.value.trim())return;
  if(t.value.trim().length>2000){alert('ದಯವಿಟ್ಟು ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು 2,000 ಅಕ್ಷರಗಳೊಳಗೆ ಬರೆಯಿರಿ.');return}
  const c={name:n.value.trim()||'ಅನಾಮಧೇಯ',txt:t.value.trim(),date:todayStr()};
  let arr;
  try{arr=await svCmt(id,c)}catch(e){console.error('Comment save failed:',e);alert('ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಪ್ರಕಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');return}
  n.value='';t.value='';
  const cl=document.getElementById('cl'+id);
  if(cl)cl.innerHTML=arr.map(x=>`<div class="ci"><div class="chdr"><span class="cauth">${esc(x.name||'ಅನಾಮಧೇಯ')}</span><span class="cdate">${x.date}</span></div><p class="ctxt">${esc(x.txt)}</p></div>`).join('')
}
async function renderIdx(){
  const el=document.getElementById('idxc');
  if(!postsFullyLoaded){
    el.innerHTML='<div class="empty">ಎಲ್ಲ ಬರಹಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
    try{await ensureAllPosts()}catch(e){console.error('Index load failed:',e);el.innerHTML='<div class="empty">ಬರಹಗಳನ್ನು ತರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</div>';return}
  }
  el.innerHTML=Object.keys(CATS).map(k=>{
    const ps=POSTS.filter(p=>p.cc===k);if(!ps.length)return'';
    return`<div class="icat"><h3>${ICONS[k]||'✦'} ${esc(CATS[k].label)}</h3><div class="ilist">${ps.map(p=>`
      <div class="ii" onclick="go('post',${p.id})">
        <span class="iititle">${esc(p.title)}</span>
        ${p.subcat?`<span class="tsub" style="font-size:.7rem">${esc(p.subcat)}</span>`:''}
        <span class="iimeta">${p.date}</span>
      </div>`).join('')}</div></div>`}).join('')
}

function collectionReadingNav(post){
  const collection=findCollection(post.collectionId);
  if(!collection)return'';
  const posts=collectionPosts(collection.id),index=posts.findIndex(item=>String(item.id)===String(post.id)),previous=index>0?posts[index-1]:null,next=index>=0&&index<posts.length-1?posts[index+1]:null;
  return`<nav class="collection-reading" aria-label="ಸಂಕಲನದಲ್ಲಿ ಸಂಚರಿಸಿ">
    <span class="collection-reading__label">${esc(collection.icon||'✦')} ${esc(collection.title)}</span>
    <div class="collection-reading__actions">
      ${previous?`<button class="back" onclick="go('post',${previous.id})">← ಹಿಂದಿನ ಬರಹ</button>`:'<span></span>'}
      <button class="back" onclick="go('collection',${collection.id})">ಸಂಕಲನ ನೋಡಿ</button>
      ${next?`<button class="back" onclick="go('post',${next.id})">ಮುಂದಿನ ಬರಹ →</button>`:'<span></span>'}
    </div>
  </nav>`;
}
async function renderCollections(){
  const el=document.getElementById('colc');
  if(collectionsLoading){el.innerHTML='<div class="empty">ಸಂಕಲನಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';return}
  if(!COLLECTIONS.length){el.innerHTML='<div class="empty">ಇನ್ನೂ ಯಾವುದೇ ಸಂಕಲನ ಪ್ರಕಟವಾಗಿಲ್ಲ.</div>';return}
  if(!postsFullyLoaded){
    el.innerHTML='<div class="empty">ಸಂಕಲನಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
    try{await ensureAllPosts()}catch(e){console.error('Collections load failed:',e);el.innerHTML='<div class="empty">ಸಂಕಲನಗಳನ್ನು ತರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</div>';return}
  }
  el.innerHTML=`<div class="collection-grid">${COLLECTIONS.map(collection=>{
    const posts=collectionPosts(collection.id);
    return`<article class="collection-card" onclick="go('collection',${collection.id})">
      <div class="collection-card__icon">${esc(collection.icon||'✦')}</div>
      <div><h2>${esc(collection.title)}</h2><p>${esc(collection.description||'ಡೀಕೆಯ ಬರಹಗಳ ಒಂದು ಸಂಕಲನ.')}</p><span>${posts.length} ${posts.length===1?'ಬರಹ':'ಬರಹಗಳು'} →</span></div>
    </article>`
  }).join('')}</div>`;
}
async function renderCollection(id){
  const collection=findCollection(id),el=document.getElementById('colvc');
  if(!collection){
    el.innerHTML=collectionsLoading?'<div class="empty">ಸಂಕಲನವನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>':'<div class="empty">ಈ ಸಂಕಲನ ಸಿಗಲಿಲ್ಲ.</div>';
    return;
  }
  if(!postsFullyLoaded){
    el.innerHTML='<div class="empty">ಸಂಕಲನವನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
    try{await ensureAllPosts()}catch(e){console.error('Collection load failed:',e);el.innerHTML='<div class="empty">ಈ ಸಂಕಲನವನ್ನು ತರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</div>';return}
  }
  const posts=collectionPosts(collection.id);
  el.innerHTML=`<section class="collection-view">
    <div class="collection-view__head"><div class="collection-card__icon">${esc(collection.icon||'✦')}</div><div><h1>${esc(collection.title)}</h1><p>${esc(collection.description||'ಡೀಕೆಯ ಬರಹಗಳ ಒಂದು ಸಂಕಲನ.')}</p></div></div>
    <div class="pactions"><button class="sbtn" onclick="shrCollection(${collection.id})">↗ ಸಂಕಲನ ಹಂಚಿಕೊಳ್ಳಿ</button><span class="stoast" id="cst${collection.id}">ಕೊಂಡಿಯನ್ನು ನಕಲಿಸಲಾಗಿದೆ!</span></div>
    ${posts.length?`<div class="collection-post-list">${posts.map((post,index)=>`<article class="collection-post" onclick="go('post',${post.id})"><span class="collection-post__number">${index+1}</span><div><h2>${esc(post.title)}</h2><p>${esc(post.exc||autoExc(post.body))}</p><small>${esc(post.date)} · ${esc(post.cat)}</small></div><span aria-hidden="true">→</span></article>`).join('')}</div>`:'<div class="empty">ಈ ಸಂಕಲನಕ್ಕೆ ಇನ್ನೂ ಯಾವುದೇ ಬರಹ ಸೇರಿಸಿಲ್ಲ.</div>'}
  </section>`;
}
function shrCollection(id){
  const collection=findCollection(id),toast=document.getElementById('cst'+id),url=new URL(routePath('collection',id),location.origin).href;
  if(navigator.share)navigator.share({title:collection?.title||'',text:'ಡೀಕೆಯ ಒಂದು ಸಂಕಲನ',url}).catch(()=>{});
  else{try{navigator.clipboard.writeText(url)}catch(e){}if(toast){toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2500)}}
}

// ── LIBRARY PUBLIC ────────────────────────────────────
function jsArg(value){return`'${String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/</g,'\\x3c').replace(/>/g,'\\x3e').replace(/&/g,'\\x26').replace(/"/g,'\\x22')}'`}
function libraryBookState(book){
  if(book.lendingPolicy==='reference')return{key:'reference',label:'ಎರವಲಿಗೆ ಇಲ್ಲ',className:'reference'};
  return{
    available:{key:'available',label:'ಲಭ್ಯವಿದೆ',className:'available'},
    reserved:{key:'reserved',label:'ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ',className:'reserved'},
    borrowed:{key:'borrowed',label:'ಎರವಲು ನೀಡಲಾಗಿದೆ',className:'borrowed'},
    unavailable:{key:'unavailable',label:'ಸದ್ಯ ಲಭ್ಯವಿಲ್ಲ',className:'unavailable'},
  }[book.status]||{key:'available',label:'ಲಭ್ಯವಿದೆ',className:'available'};
}
function librarySearch(value){
  librarySearchQ=String(value||'').trim().toLowerCase();
  const clear=document.getElementById('lib-search-clear');if(clear)clear.style.display=librarySearchQ?'':'none';
  renderLibrary();
}
function clearLibrarySearch(){
  librarySearchQ='';const input=document.getElementById('lib-search');if(input)input.value='';
  const clear=document.getElementById('lib-search-clear');if(clear)clear.style.display='none';renderLibrary();
}
function libraryFilter(value){libraryAvailability=value||'all';renderLibrary()}
function renderLibrary(){
  const grid=document.getElementById('lib-grid'),count=document.getElementById('lib-count');if(!grid)return;
  if(libraryLoading){grid.innerHTML='<div class="empty">ಪುಸ್ತಕಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';if(count)count.textContent='';return}
  let books=[...BOOKS];
  if(librarySearchQ)books=books.filter(book=>[book.title,book.author,book.language,book.category,book.isbn,book.publisher].some(value=>String(value||'').toLowerCase().includes(librarySearchQ)));
  if(libraryAvailability==='available')books=books.filter(book=>libraryBookState(book).key==='available');
  else if(libraryAvailability==='borrowed')books=books.filter(book=>['borrowed','reserved'].includes(libraryBookState(book).key));
  else if(libraryAvailability==='reference')books=books.filter(book=>libraryBookState(book).key==='reference');
  books.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'kn'));
  if(count)count.textContent=`${books.length} ಪುಸ್ತಕ${books.length===1?'':'ಗಳು'}`;
  if(!books.length){grid.innerHTML='<div class="empty">ಹೊಂದಿಕೆಯಾಗುವ ಪುಸ್ತಕಗಳು ಸಿಗಲಿಲ್ಲ.</div>';return}
  grid.innerHTML=books.map(book=>{
    const cover=safeContentUrl(book.coverImage),state=libraryBookState(book),argument=jsArg(book.id);
    return`<article class="library-card" onclick="go('book',${argument})">
      <div class="library-cover">${cover?`<img src="${esc(cover)}" alt="${esc(book.title)} ಪುಸ್ತಕದ ಮುಖಪುಟ" loading="lazy" onerror="this.parentElement.innerHTML='📚'">`:'📚'}</div>
      <div class="library-card__body"><span class="library-status ${state.className}">${state.label}</span><h2>${esc(book.title)}</h2><p class="library-author">${esc(book.author||'ಲೇಖಕರು ತಿಳಿಸಿಲ್ಲ')}</p>
      <p class="library-meta">${[book.language,book.category,book.year].filter(Boolean).map(esc).join(' · ')}</p>${book.description?`<p class="library-description">${esc(autoExc(book.description))}</p>`:''}</div>
    </article>`;
  }).join('');
}
async function renderLibraryBook(id){
  const el=document.getElementById('book-view');if(!el)return;
  let book=findBook(id);
  if(!book&&window.getFirestoreLibraryBookById){
    el.innerHTML='<div class="empty">ಪುಸ್ತಕದ ವಿವರಗಳನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>';
    try{book=await window.getFirestoreLibraryBookById(id);if(book){BOOKS.push(book)}}catch(error){console.error('Library book load failed:',error)}
  }
  if(!book){el.innerHTML='<div class="empty">ಈ ಪುಸ್ತಕ ಸಿಗಲಿಲ್ಲ.</div>';return}
  const cover=safeContentUrl(book.coverImage),state=libraryBookState(book),argument=jsArg(book.id);
  el.innerHTML=`<article class="library-book-view">
    <div class="library-book-cover">${cover?`<img src="${esc(cover)}" alt="${esc(book.title)} ಪುಸ್ತಕದ ಮುಖಪುಟ" onerror="this.parentElement.innerHTML='📚'">`:'📚'}</div>
    <div class="library-book-info"><span class="library-status ${state.className}">${state.label}</span><h1>${esc(book.title)}</h1><p class="library-book-author">${esc(book.author||'ಲೇಖಕರು ತಿಳಿಸಿಲ್ಲ')}</p>
      <dl class="library-facts">
        ${book.language?`<div><dt>ಭಾಷೆ</dt><dd>${esc(book.language)}</dd></div>`:''}
        ${book.category?`<div><dt>ವಿಭಾಗ</dt><dd>${esc(book.category)}</dd></div>`:''}
        ${book.publisher?`<div><dt>ಪ್ರಕಾಶಕರು</dt><dd>${esc(book.publisher)}</dd></div>`:''}
        ${book.year?`<div><dt>ವರ್ಷ</dt><dd>${esc(book.year)}</dd></div>`:''}
        ${book.isbn?`<div><dt>ISBN</dt><dd>${esc(book.isbn)}</dd></div>`:''}
        ${book.shelf?`<div><dt>ಇರುವ ಸ್ಥಳ</dt><dd>${esc(book.shelf)}</dd></div>`:''}
      </dl>
      ${book.description?`<p class="library-book-description">${esc(book.description)}</p>`:''}
      <div class="pactions"><button class="sbtn" onclick="shareLibraryBook(${argument})">↗ ಪುಸ್ತಕ ಹಂಚಿಕೊಳ್ಳಿ</button><span class="stoast" id="book-share-toast">ಕೊಂಡಿಯನ್ನು ನಕಲಿಸಲಾಗಿದೆ!</span></div>
    </div>
  </article><section class="library-request" id="library-request-area"><div class="empty">ಎರವಲು ಮಾಹಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...</div></section>`;
  renderLibraryRequestArea(book);
}
async function renderLibraryRequestArea(book){
  const el=document.getElementById('library-request-area');if(!el)return;
  const state=libraryBookState(book);
  if(book.lendingPolicy==='reference'){
    el.innerHTML='<h2>ಎರವಲು</h2><p>ಈ ಪುಸ್ತಕವನ್ನು ಸ್ಥಳದಲ್ಲೇ ಓದಲು ಮಾತ್ರ ಇಡಲಾಗಿದೆ; ಎರವಲಿಗೆ ಲಭ್ಯವಿಲ್ಲ.</p>';return;
  }
  let existing=null;
  try{existing=window.getMyFirestoreLibraryRequest?await window.getMyFirestoreLibraryRequest(book.id):null}
  catch(error){console.error('Borrowing request check failed:',error);el.innerHTML='<div class="empty">ಎರವಲು ಮಾಹಿತಿಯನ್ನು ತರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.</div>';return}
  if(!document.getElementById('library-request-area'))return;
  if(existing&&['requested','approved','borrowed'].includes(existing.status)){
    const labels={requested:'ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ. ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಿರಿ.',approved:'ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ಒಪ್ಪಲಾಗಿದೆ. ಪುಸ್ತಕ ಪಡೆಯಲು ಸಂಪರ್ಕಿಸಿ.',borrowed:`ಈ ಪುಸ್ತಕ ಈಗ ನಿಮ್ಮ ಹೆಸರಿನಲ್ಲಿ ಎರವಲಾಗಿದೆ.${existing.dueDate?' ಹಿಂದಿರುಗಿಸುವ ದಿನ: '+esc(existing.dueDate):''}`};
    el.innerHTML=`<div class="library-request-result"><h2>ನಿಮ್ಮ ಎರವಲು ಸ್ಥಿತಿ</h2><p>${labels[existing.status]}</p></div>`;return;
  }
  if(state.key!=='available'){
    el.innerHTML=`<h2>ಎರವಲು</h2><p>${state.label}. ಪುಸ್ತಕ ಮತ್ತೆ ಲಭ್ಯವಾದಾಗ ವಿನಂತಿಸಬಹುದು.</p>`;return;
  }
  el.innerHTML=`<h2>ಈ ಪುಸ್ತಕವನ್ನು ಎರವಲು ಕೇಳಿ</h2><p class="library-request-note">ವಿನಂತಿ ಒಪ್ಪಿದ ಬಳಿಕ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಲಾಗುತ್ತದೆ. ನಿಮ್ಮ ಸಂಪರ್ಕ ಮಾಹಿತಿ ತಾಣದ ನಿರ್ವಾಹಕರಿಗೆ ಮಾತ್ರ ಕಾಣಿಸುತ್ತದೆ.</p>
    <div class="library-request-form">
      <div class="frow2"><div class="frow"><label for="borrow-name">ನಿಮ್ಮ ಹೆಸರು</label><input id="borrow-name" type="text" maxlength="80" autocomplete="name"></div><div class="frow"><label for="borrow-contact">ದೂರವಾಣಿ / ಮಿಂಚಂಚೆ</label><input id="borrow-contact" type="text" maxlength="120" autocomplete="email"></div></div>
      <div class="frow"><label for="borrow-message">ಸಂದೇಶ <span style="font-weight:400">(ಐಚ್ಛಿಕ)</span></label><textarea id="borrow-message" rows="3" maxlength="500" placeholder="ಪುಸ್ತಕವನ್ನು ಯಾವಾಗ ಪಡೆಯಲು ಬಯಸುತ್ತೀರಿ?"></textarea></div>
      <button class="library-request-button" id="borrow-submit" onclick="submitLibraryRequest(${jsArg(book.id)})">ವಿನಂತಿ ಕಳುಹಿಸಿ</button>
    </div>`;
}
async function submitLibraryRequest(id){
  const book=findBook(id),name=document.getElementById('borrow-name')?.value.trim(),contact=document.getElementById('borrow-contact')?.value.trim(),message=document.getElementById('borrow-message')?.value.trim()||'',button=document.getElementById('borrow-submit');
  if(!book)return;
  if(!name||name.length<2){alert('ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.');return}
  if(!contact||contact.length<3){alert('ದಯವಿಟ್ಟು ದೂರವಾಣಿ ಸಂಖ್ಯೆ ಅಥವಾ ಮಿಂಚಂಚೆ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.');return}
  if(!window.saveFirestoreLibraryRequest){alert('ಎರವಲು ವಿನಂತಿ ಸೇವೆ ಸಿದ್ಧವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');return}
  if(button){button.disabled=true;button.textContent='ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…'}
  try{await window.saveFirestoreLibraryRequest(book,{name,contact,message});await renderLibraryRequestArea(book)}
  catch(error){console.error('Borrowing request save failed:',error);alert('ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');if(button){button.disabled=false;button.textContent='ವಿನಂತಿ ಕಳುಹಿಸಿ'}}
}
function shareLibraryBook(id){
  const book=findBook(id),toast=document.getElementById('book-share-toast'),url=new URL(routePath('book',id),location.origin).href;
  if(navigator.share)navigator.share({title:book?.title||'',text:'ಡೀಕೆಯ ಪುಸ್ತಕಾಲಯದಲ್ಲಿರುವ ಪುಸ್ತಕ',url}).catch(()=>{});
  else{try{navigator.clipboard.writeText(url)}catch(error){}if(toast){toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2500)}}
}

// ── QUIZ PUBLIC ───────────────────────────────────────
function qTab(t){
  const c=document.getElementById('qcur'),a=document.getElementById('qarc');
  const sc=document.getElementById('qsn-c'),sa=document.getElementById('qsn-a');
  if(t==='c'){c.style.display='';a.style.display='none';sc.classList.add('on');sa.classList.remove('on')}
  else{c.style.display='none';a.style.display='';sa.classList.add('on');sc.classList.remove('on');renderQArcList()}
}
function availableQuizzes(){return Q&&['upcoming','live'].includes(Q.state)?[Q]:[]}
function renderQuiz(){
  const cur=document.getElementById('qcur'),quizzes=availableQuizzes();
  if(!quizzes.length){
    cur.innerHTML=`<div style="text-align:center;padding:60px 20px">
      <div style="font-size:3rem;margin-bottom:16px">📝</div>
      <h3 style="font-family:'Playfair Display',serif;color:var(--ac);font-size:1.4rem;margin-bottom:10px">ಸದ್ಯ ಯಾವುದೇ ಕ್ವಿಜ಼್ ನಡೆಯುತ್ತಿಲ್ಲ</h3>
      <p style="color:var(--il);font-style:italic;margin-bottom:24px">ಸ್ವಲ್ಪ ಸಮಯದ ಬಳಿಕ ಮತ್ತೆ ನೋಡಿ ಅಥವಾ ಹಳೆಯ ಕ್ವಿಜ಼್‌ಗಳನ್ನು ವೀಕ್ಷಿಸಿ.</p>
      <button class="qsn" onclick="qTab('a')">ಹಳೆಯ ಕ್ವಿಜ಼್‌ಗಳನ್ನು ನೋಡಿ →</button>
    </div>`;
  }else{
    cur.innerHTML=`<section class="active-quiz-list"><h3>ಕ್ವಿಜ಼್ ಆಯ್ಕೆಮಾಡಿ</h3><p>ವಿವರಗಳನ್ನು ನೋಡಲು ಮತ್ತು ಭಾಗವಹಿಸಲು ಕ್ವಿಜ಼್ಅ‌ನ್ನು ಆಯ್ಕೆಮಾಡಿ.</p>${quizzes.map(renderActiveQuizCard).join('')}</section>`;
  }
  renderQArcList()
}
function renderActiveQuizCard(quiz){
  const isLive=quiz.state==='live';
  return`<article class="active-quiz-card">
    <div class="active-quiz-card__icon">${isLive?'🏆':'📅'}</div>
    <div class="active-quiz-card__body"><div class="active-quiz-card__meta">${isLive?'ಈಗ ನಡೆಯುತ್ತಿದೆ':'ಮುಂಬರುವ'} · ${quiz.type==='prize'?'🎁 ಬಹುಮಾನದ ಕ್ವಿಜ಼್':'📜 ಪ್ರಮಾಣಪತ್ರದ ಕ್ವಿಜ಼್'}</div><h4>${esc(quiz.title)}</h4><p>${esc(quiz.description||'')}</p>${quiz.deadline?`<small>⏰ ${esc(quiz.deadline)}</small>`:''}</div>
    <button class="qsn active-quiz-card__button" onclick="go('qplay',${quiz.id})">${isLive?'ಭಾಗವಹಿಸಿ →':'ವಿವರಗಳನ್ನು ನೋಡಿ →'}</button>
  </article>`;
}
function renderQuizPlay(id){
  if(!Q||String(Q.id)!==String(id)){renderQDetail(id);return}
  const cur=document.getElementById('qpc');
  if(Q.state==='upcoming'){
    cur.innerHTML=`<div class="qposter">
      <div style="font-size:2.5rem;margin-bottom:14px">🏆</div>
      <h3>${esc(Q.title)}</h3>
      <div class="qpos-sub">${Q.date?'📅 '+esc(Q.date):''}</div>
      <p class="qpos-desc">${esc(Q.description||'')}</p>
      ${Q.prize?`<div class="qpos-prize">🎁 ಬಹುಮಾನ: ${esc(Q.prize)}</div><br>`:''}
      ${Q.deadline?`<div class="qpos-dl">⏰ ಕೊನೆಯ ಸಮಯ: ${esc(Q.deadline)}</div>`:''}
    </div>`;
  }else if(Q.state==='live'){
    const quizId=String(Q.id);
    if(qSubmissionQuizId!==quizId){
      qSubmissionQuizId=quizId;
      qSubmitted=false;
      if(window.hasFirestoreQuizSubmission){
        qSubmissionCheckInFlight=true;
        window.hasFirestoreQuizSubmission(Q.id)
          .then(submitted=>{if(Q&&String(Q.id)===quizId)qSubmitted=submitted})
          .catch(error=>console.error('Quiz submission check failed:',error))
          .finally(()=>{if(Q&&String(Q.id)===quizId){qSubmissionCheckInFlight=false;renderQuizPlay(Q.id)}});
      }
    }
    if(qSubmissionCheckInFlight){
      cur.innerHTML='<div class="empty">ನಿಮ್ಮ ಕ್ವಿಜ಼್ ಉತ್ತರ ಸಲ್ಲಿಕೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…</div>';
    }else if(qSubmitted){
      cur.innerHTML=`<div style="text-align:center;padding:40px"><p style="color:var(--il);font-style:italic">ನೀವು ಈ ಕ್ವಿಜ಼್‌ಗೆ ಈಗಾಗಲೇ ಉತ್ತರಗಳನ್ನು ಸಲ್ಲಿಸಿದ್ದೀರಿ. ಭಾಗವಹಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು! 🙏</p></div>`;
    }else{
      renderLiveQuiz(cur);
    }
  }else{
    cur.innerHTML=`<div style="text-align:center;padding:60px 20px"><div style="font-size:2rem;margin-bottom:14px">🔒</div><h3 style="font-family:'Playfair Display',serif;color:var(--ac);margin-bottom:10px">ಕ್ವಿಜ಼್ ಮುಕ್ತಾಯವಾಗಿದೆ</h3><p style="color:var(--il);font-style:italic">ಈ ಕ್ವಿಜ಼್ ಮುಗಿದಿದೆ. ಫಲಿತಾಂಶಗಳನ್ನು ಶೀಘ್ರದಲ್ಲೇ ಪ್ರಕಟಿಸಲಾಗುವುದು.</p></div>`;
  }
}
function renderLiveQuiz(el){
  el.innerHTML=`<div class="qform-wrap">
    <div class="qnamebox">
      <h3>ನಿಮ್ಮ ವಿವರಗಳು</h3>
      <input type="text" id="q-name" placeholder="ನಿಮ್ಮ ಹೆಸರು (ಪ್ರಮಾಣಪತ್ರದಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ)" maxlength="80">
      <p class="qname-note">ಭಾಗವಹಿಸಿದವರ ವಿವರಗಳಿಗಾಗಿ ನಿಮ್ಮ ಹೆಸರು ತಾಣದ ನಿರ್ವಾಹಕರಿಗೆ ಮಾತ್ರ ಕಾಣಿಸುತ್ತದೆ.</p>
      ${Q.type==='prize'?`<input type="text" id="q-con" placeholder="ಮಿಂಚಂಚೆ ಅಥವಾ ವಾಟ್ಸಾಪ್ ಸಂಖ್ಯೆ (ಬಹುಮಾನದ ಕುರಿತು ಸಂಪರ್ಕಿಸಲು ಮಾತ್ರ ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗುತ್ತದೆ)" maxlength="100">`:''}
    </div>
    ${Q.questions.map((qu,i)=>`<div class="qcard" id="qc-${i}">
      <div class="qnum">ಒಟ್ಟು ${Q.questions.length} ಪ್ರಶ್ನೆಗಳಲ್ಲಿ ${i+1}ನೇ ಪ್ರಶ್ನೆ</div>
      <div class="qtxt">${esc(qu.q)}</div>
      <div class="qopts">${qu.opts.map((o,j)=>`
        <label class="qopt" id="qo-${i}-${j}" onclick="selOpt(${i},${j})">
          <input type="radio" name="qr-${i}" value="${j}"><span>${esc(o)}</span>
        </label>`).join('')}
      </div>
    </div>`).join('')}
    <button class="qsubmit" onclick="submitQuiz()">ಉತ್ತರಗಳನ್ನು ಸಲ್ಲಿಸಿ ✓</button>
  </div>`
}
function selOpt(qi,oi){
  document.querySelectorAll(`[id^="qo-${qi}-"]`).forEach(e=>e.classList.remove('sel'));
  document.getElementById(`qo-${qi}-${oi}`)?.classList.add('sel');
  const r=document.getElementById(`qo-${qi}-${oi}`)?.querySelector('input[type=radio]');
  if(r)r.checked=true
}
async function submitQuiz(){
  if(qSubmitting)return;
  const name=document.getElementById('q-name')?.value.trim();
  if(!name){alert('ಸಲ್ಲಿಸುವ ಮೊದಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.');return}
  if(!Q)return;
  const answers=Q.questions.map((_,i)=>{
    const c=document.querySelector(`input[name="qr-${i}"]:checked`);return c?parseInt(c.value):-1
  });
  const ua=answers.filter(a=>a===-1).length;
  if(ua>0&&!confirm(`${ua} ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿಲ್ಲ. ಆದರೂ ಸಲ್ಲಿಸಬೇಕೇ?`))return;
  let score=0;
  Q.questions.forEach((q,i)=>{if(answers[i]===q.ans)score++});
  const con=Q.type==='prize'?document.getElementById('q-con')?.value.trim()||'':'';
  if(Q.type==='prize'&&con.length<3){alert('ಬಹುಮಾನದ ಕುರಿತು ಸಂಪರ್ಕಿಸಲು ದಯವಿಟ್ಟು ಮಿಂಚಂಚೆ ವಿಳಾಸ ಅಥವಾ ವಾಟ್ಸಾಪ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.');return}
  if(!window.saveFirestoreQuizSubmission){
    alert('ಕ್ವಿಜ಼್ ಉತ್ತರ ಸಲ್ಲಿಸುವ ಸೇವೆ ಇನ್ನೂ ಸಿದ್ಧವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಹೊತ್ತಿನ ಬಳಿಕ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
    return;
  }
  qSubmitting=true;
  const submitButton=document.querySelector('.qsubmit');
  if(submitButton){submitButton.disabled=true;submitButton.textContent='ಉತ್ತರಗಳನ್ನು ಉಳಿಸಲಾಗುತ್ತಿದೆ…'}
  try{
    await window.saveFirestoreQuizSubmission(Q.id,answers,name,Q.type==='prize'?{name,contact:con}:null);
  }catch(error){
    console.error('Quiz submission save failed:',error);
    alert('ನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಈ ಬ್ರೌಸರ್‌ನಿಂದ ಈಗಾಗಲೇ ಸಲ್ಲಿಸಿರಬಹುದು. ಪರಿಶೀಲಿಸಲು ಪುಟವನ್ನು ಮರುಲೋಡ್ ಮಾಡಿ.');
    if(submitButton){submitButton.disabled=false;submitButton.textContent='ಉತ್ತರಗಳನ್ನು ಸಲ್ಲಿಸಿ ✓'}
    qSubmitting=false;
    return;
  }
  if(!Q.stats)Q.stats={total:0,qs:{}};
  Q.stats.total=(Q.stats.total||0)+1;
  Q.questions.forEach((q,i)=>{
    if(!Q.stats.qs[i])Q.stats.qs[i]={c:0,w:0};
    if(answers[i]===q.ans)Q.stats.qs[i].c++;else Q.stats.qs[i].w++
  });
  qSubmitted=true;
  qSubmitting=false;
  showResults(Q,answers,name,score)
}
function showResults(q,answers,name,score){
  const total=q.questions.length,pct=Math.round(score/total*100);
  const cur=document.getElementById('qpc')||document.getElementById('qcur');
  certData={name,title:q.title,score,total,date:todayStr(),template:q.certificateTemplate};
  let h=`<div class="qscore-box">
    <div style="font-size:1.8rem;margin-bottom:8px">${score===total?'🏆':score>=total*.7?'🎉':score>=total*.5?'👍':'📚'}</div>
    <div class="qscore">${score} / ${total}</div>
    <div class="qscore-sub">${pct}% · ${score===total?'ಎಲ್ಲವೂ ಸರಿ!':score>=total*.7?'ಚೆನ್ನಾಗಿ ಮಾಡಿದ್ದೀರಿ!':score>=total*.5?'ಒಳ್ಳೆಯ ಪ್ರಯತ್ನ!':'ಓದು ಮುಂದುವರಿಸಿ!'}</div>
    ${q.type==='certificate'?`<br><button class="certbtn" onclick="genCert()">📜 ಪ್ರಮಾಣಪತ್ರ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ</button>`:''}
    ${q.type==='prize'?`<p style="color:var(--il);font-size:.88rem;font-style:italic;margin-top:14px">ಧನ್ಯವಾದಗಳು ${esc(name)}! ನೀವು ವಿಜೇತರಲ್ಲಿ ಒಬ್ಬರಾಗಿದ್ದರೆ, ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ. 🎁</p>`:''}
  </div><div class="qform-wrap">`;
  q.questions.forEach((qu,i)=>{
    const ua=answers[i],ok=ua===qu.ans;
    h+=`<div class="qcard" style="border-left-color:${ok?'#2d6a2d':'#c0392b'}">
      <div class="qnum">ಪ್ರಶ್ನೆ ${i+1} — ${ok?'✓ ಸರಿ':'✗ ತಪ್ಪು'}</div>
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
const CERT_FONT_STACKS={
  'Playfair Display':`'Playfair Display','Noto Sans Kannada',serif`,
  'Lora':`'Lora','Noto Sans Kannada',serif`,
  'Anek Kannada':`'Anek Kannada','Noto Sans Kannada',sans-serif`,
  'Noto Sans Kannada':`'Noto Sans Kannada',sans-serif`,
};
function defaultCertificateTemplate(){
  return{
    emblem:'✦ ✦ ✦',heading:'ಭಾಗವಹಿಸಿದ ಪ್ರಮಾಣಪತ್ರ',intro:'ಈ ಮೂಲಕ ಪ್ರಮಾಣೀಕರಿಸುವುದೇನೆಂದರೆ,',
    body:'{quizTitle} ಕ್ವಿಜ಼್‌ನಲ್ಲಿ ಯಶಸ್ವಿಯಾಗಿ ಭಾಗವಹಿಸಿದ್ದಾರೆ.',scoreText:'ಅಂಕಗಳು: {score} / {total} ({percent}%)',
    issuer:`ಡೀಕೆಯ ಬರಹಗಳು`,issuerRole:'ಬರಹಗಾರ',background:'#fffdf5',accent:'#7a3b1e',border:'#c8a87a',
    font:'Lora',titleFont:'Playfair Display',align:'center',borderStyle:'double',titleSize:26,nameSize:38,
  };
}
function safeCertificateColor(value,fallback){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback}
function certificateTemplate(template){
  const fallback=defaultCertificateTemplate(),source=template&&typeof template==='object'?template:{};
  const text=(key,max=240)=>typeof source[key]==='string'?source[key].slice(0,max):fallback[key];
  return{...fallback,emblem:text('emblem',80),heading:text('heading',160),intro:text('intro',240),body:text('body',360),scoreText:text('scoreText',240),issuer:text('issuer',120),issuerRole:text('issuerRole',120),
    background:safeCertificateColor(source.background,fallback.background),accent:safeCertificateColor(source.accent,fallback.accent),border:safeCertificateColor(source.border,fallback.border),
    font:CERT_FONT_STACKS[source.font]?source.font:fallback.font,titleFont:CERT_FONT_STACKS[source.titleFont]?source.titleFont:fallback.titleFont,
    align:['left','center','right'].includes(source.align)?source.align:fallback.align,borderStyle:['solid','double'].includes(source.borderStyle)?source.borderStyle:fallback.borderStyle,
    titleSize:Math.max(16,Math.min(44,Number(source.titleSize)||fallback.titleSize)),nameSize:Math.max(24,Math.min(64,Number(source.nameSize)||fallback.nameSize))};
}
function certificateValues(data){
  const total=Number(data.total)||0,score=Number(data.score)||0;
  return{name:data.name||'',quizTitle:data.title||'',score,total,percent:total?Math.round(score/total*100):0,date:data.date||''};
}
function certificateText(text,values){return esc(String(text||'').replace(/\{(name|quizTitle|score|total|percent|date)\}/g,(_,key)=>String(values[key]??''))).replace(/\n/g,'<br>')}
function renderCertificateMarkup(data,template){
  const t=certificateTemplate(template),values=certificateValues(data),titleFont=CERT_FONT_STACKS[t.titleFont],bodyFont=CERT_FONT_STACKS[t.font];
  return`<div class="certificate-sheet" style="--cert-bg:${t.background};--cert-accent:${t.accent};--cert-border:${t.border};--cert-align:${t.align};--cert-title-size:${t.titleSize}px;--cert-name-size:${t.nameSize}px;--cert-title-font:${titleFont};--cert-body-font:${bodyFont};--cert-border-style:${t.borderStyle}">
    <div class="certificate-sheet__inner">
      <div class="certificate-emblem">${certificateText(t.emblem,values)}</div>
      <div class="certificate-heading">${certificateText(t.heading,values)}</div>
      <p class="certificate-intro">${certificateText(t.intro,values)}</p>
      <div class="certificate-name">${certificateText('{name}',values)}</div>
      <p class="certificate-body">${certificateText(t.body,values)}</p>
      <div class="certificate-score">${certificateText(t.scoreText,values)}</div>
      <div class="certificate-footer"><div class="certificate-issuer"><div>${certificateText(t.issuer,values)}</div><small>${certificateText(t.issuerRole,values)}</small></div><div class="certificate-date">${certificateText('{date}',values)}</div></div>
    </div>
  </div>`;
}
let certData=null;
function genCert(){
  if(!certData)return;
  document.getElementById('cert-inner').innerHTML=renderCertificateMarkup(certData,certData.template);
  go('cert')
}
function renderQArcList(){
  const el=document.getElementById('qarc');
  if(!QA.length){el.innerHTML='<div class="empty">ಇನ್ನೂ ಯಾವುದೇ ಹಳೆಯ ಕ್ವಿಜ಼್‌ಗಳಿಲ್ಲ. ಮುಗಿದ ಕ್ವಿಜ಼್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.</div>';return}
  el.innerHTML='<h3 style="font-family:\'Playfair Display\',serif;color:var(--ac);margin-bottom:16px">ಹಳೆಯ ಕ್ವಿಜ಼್‌ಗಳು</h3>'+
  QA.map(q=>`<div class="aqcard" onclick="go('qdetail',${q.id})">
    <div><div class="aqcard-title">${esc(q.title)}</div>
    <div class="aqcard-meta">${q.date} · ${q.total} ಭಾಗವಹಿಸಿದವರು · ${(q.questions||[]).length} ಪ್ರಶ್ನೆಗಳು</div></div>
    <span class="tsub" style="font-size:.74rem">${q.type==='prize'?'🎁 ಬಹುಮಾನ':'📜 ಪ್ರಮಾಣಪತ್ರ'}</span>
  </div>`).join('')
}
function renderQDetail(id){
  const q=findQuiz(id),el=document.getElementById('qdc');
  if(!q){
    el.innerHTML=contentLoading
      ?'<div class="empty">ಕ್ವಿಜ಼್ಅ‌ನ್ನು ತರಲಾಗುತ್ತಿದೆ...</div>'
      :'<div class="empty">ಈ ಕ್ವಿಜ಼್ ಸಿಗಲಿಲ್ಲ.</div>';
    return;
  }
  const tot=q.questions.reduce((s,qu)=>{const t=(qu.stats?.c||0)+(qu.stats?.w||0);return s+t},0);
  const cor=q.questions.reduce((s,qu)=>s+(qu.stats?.c||0),0);
  el.innerHTML=`
    <h1 class="stitle">${esc(q.title)}</h1>
    <p class="ssub">${q.date} · ${q.type==='certificate'?'ಪ್ರಮಾಣಪತ್ರದ ಕ್ವಿಜ಼್':'ಬಹುಮಾನದ ಕ್ವಿಜ಼್'}</p>
    <div class="aqstats">
      <div class="aqstat"><div class="aqstat-n">${q.total}</div><div class="aqstat-l">ಭಾಗವಹಿಸಿದವರು</div></div>
      <div class="aqstat"><div class="aqstat-n">${q.questions.length}</div><div class="aqstat-l">ಪ್ರಶ್ನೆಗಳು</div></div>
      <div class="aqstat"><div class="aqstat-n">${tot?Math.round(cor/tot*100)+'%':'—'}</div><div class="aqstat-l">ಸರಿಯಾದ ಉತ್ತರಗಳ ಸರಾಸರಿ</div></div>
    </div>
    ${q.questions.map((qu,i)=>{
      const c=qu.stats?.c||0,w=qu.stats?.w||0,t=c+w,p=t?Math.round(c/t*100):0;
      return`<div class="aqq">
        <div class="aqq-t">${i+1}. ${esc(qu.q)}</div>
        ${qu.opts.map((o,j)=>`<div class="aqopt${j===qu.ans?' ans':''}">${j===qu.ans?'✓ ':''}${esc(o)}</div>`).join('')}
        ${qu.exp?`<div class="qexp">💡 ${esc(qu.exp)}</div>`:''}
        ${t?`<div class="sbar"><div class="sbar-f" style="width:${p}%"></div></div><div class="spct">${p}% ಸರಿ (ಒಟ್ಟು ${t}ರಲ್ಲಿ ${c})</div>`:''}
      </div>`}).join('')}
    <div class="div" style="margin-top:32px">✦</div>
    <div class="pnav"><button class="back" onclick="go('quiz')">← ಕ್ವಿಜ಼್‌ಗೆ ಹಿಂತಿರುಗಿ</button><button class="sbtn" onclick="shrQ(${q.id})">↗ ಕ್ವಿಜ಼್ ಹಂಚಿಕೊಳ್ಳಿ</button><span class="stoast" id="qst${q.id}">ಕೊಂಡಿಯನ್ನು ನಕಲಿಸಲಾಗಿದೆ!</span></div>`
}
function shrQ(id){
  const q=findQuiz(id),t=document.getElementById('qst'+id),url=new URL(routePath('qdetail',id),location.origin).href;
  if(navigator.share)navigator.share({title:q?.title||'',text:'ಡೀಕೆಯ ಒಂದು ಕ್ವಿಜ಼್',url}).catch(()=>{});
  else{try{navigator.clipboard.writeText(url)}catch(e){}if(t){t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}}
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
async function aTab(btn,tab){
  document.querySelectorAll('.adtab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.adtabc').forEach(c=>c.classList.remove('on'));
  btn.classList.add('on');document.getElementById('atab-'+tab).classList.add('on');
  if(['posts','collections','cats'].includes(tab)&&!postsFullyLoaded){
    const status=document.getElementById(tab==='posts'?'apl':tab==='collections'?'cpl':'cw');
    if(status)status.innerHTML='<div class="empty">Loading all writings...</div>';
    try{await ensureAllPosts()}catch(e){console.error('Admin posts load failed:',e);if(status)status.innerHTML='<div class="empty">Writings could not be loaded.</div>';return}
  }
  if(tab==='posts')renderAdPosts();
  else if(tab==='collections')renderAdCollections();
  else if(tab==='library')loadAdminLibrary();
  else if(tab==='cats')renderAdCats();
  else if(tab==='quiz')renderAdQuiz()
}
async function renderAdmin(){
  document.querySelectorAll('.adtab').forEach((b,i)=>b.classList.toggle('on',i===0));
  document.querySelectorAll('.adtabc').forEach((c,i)=>c.classList.toggle('on',i===0));
  document.getElementById('afw').innerHTML='';document.getElementById('cfw').innerHTML='';document.getElementById('libfw').innerHTML='';editId=null;collectionEditId=null;bookEditId=null;
  const list=document.getElementById('apl');
  if(!postsFullyLoaded){
    list.innerHTML='<div class="empty">Loading all writings...</div>';
    try{await ensureAllPosts()}catch(e){console.error('Admin posts load failed:',e);list.innerHTML='<div class="empty">Writings could not be loaded.</div>';return}
  }
  renderAdPosts()
}

// ── ADMIN: POSTS ──────────────────────────────────────
function renderAdPosts(){
  const el=document.getElementById('apl');
  if(!POSTS.length){el.innerHTML='<div class="empty">No posts yet.</div>';return}
  el.innerHTML=[...POSTS].reverse().map(p=>`<div class="apost">
    <div class="apost-info"><div class="apost-title">${esc(p.title)}</div>
    <div class="apost-meta">${esc(p.cat)}${p.subcat?' · '+esc(p.subcat):''}${findCollection(p.collectionId)?' · '+esc(findCollection(p.collectionId).title):''} · ${esc(p.lang)} · ${p.date}</div></div>
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
function collectionOpts(selectedId){
  return`<option value="">— No collection —</option>${COLLECTIONS.map(collection=>`<option value="${collection.id}"${String(collection.id)===String(selectedId||'')?' selected':''}>${esc(collection.icon||'✦')} ${esc(collection.title)}</option>`).join('')}`
}
let richSelection=null;
function richEditor(){return document.getElementById('f-b')}
function captureRichSelection(){
  const editor=richEditor(),selection=window.getSelection();
  if(!editor||!selection||!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(editor.contains(range.commonAncestorContainer))richSelection=range.cloneRange();
}
function restoreRichSelection(){
  const editor=richEditor(),selection=window.getSelection();
  if(!editor)return false;
  editor.focus();
  if(!richSelection||!selection)return true;
  selection.removeAllRanges();selection.addRange(richSelection);
  return true;
}
function normaliseRichFontSize(){
  const editor=richEditor();if(!editor)return;
  editor.querySelectorAll('font').forEach(font=>{
    const size=Number(font.getAttribute('size')),sizeClass=size>=5?'rt-size-large':size<=2?'rt-size-small':'';
    const children=Array.from(font.childNodes);
    if(sizeClass){
      const span=document.createElement('span');span.className=sizeClass;span.append(...children);font.replaceWith(span);
    }else font.replaceWith(...children);
  });
}
function richCommand(command,value=null){
  if(!restoreRichSelection())return;
  document.execCommand(command,false,value);
  normaliseRichFontSize();captureRichSelection();
}
function richBlock(tag){
  if(!['p','h2','h3','h4'].includes(tag))return;
  richCommand('formatBlock',tag);
}
function richFontSize(direction){richCommand('fontSize',direction==='increase'?'5':'2')}
function richClearFormatting(){
  richCommand('removeFormat');
  const editor=richEditor();if(!editor)return;
  editor.querySelectorAll('span.rt-size-small,span.rt-size-large').forEach(span=>span.replaceWith(...Array.from(span.childNodes)));
  captureRichSelection();
}
function richLink(){
  const entered=window.prompt('Paste a link (https://...)');if(entered===null)return;
  const href=safeContentUrl(entered.trim());
  if(!href){alert('Please enter a valid http or https link.');return}
  richCommand('createLink',href);
}
function richImage(){
  const entered=window.prompt('Paste an image link (https://...)');if(entered===null)return;
  const src=safeContentUrl(entered.trim());
  if(!src){alert('Please enter a valid http or https image link.');return}
  richCommand('insertImage',src);
}
function richPastePlainText(event){
  event.preventDefault();
  const text=event.clipboardData?.getData('text/plain')||'';
  richCommand('insertText',text);
}
function richEditorHtml(){
  const editor=richEditor();if(!editor)return'';
  normaliseRichFontSize();
  return safePostHtml(editor.innerHTML).trim();
}
function richEditorText(){
  return String(richEditor()?.innerText||'').trim();
}
function setRichEditorContent(post){
  const editor=richEditor();if(!editor)return;
  editor.innerHTML=safePostHtml(post.html||bodyToRichHtml(post.body||''));
  richSelection=null;
}
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
    <div class="frow2">
      <div class="frow"><label>Collection <span style="font-weight:400;color:var(--gd)">(optional)</span></label><select id="f-col">${collectionOpts(p?.collectionId)}</select></div>
      <div class="frow"><label>Collection order <span style="font-weight:400;color:var(--gd)">(optional)</span></label><input type="number" id="f-co" min="1" step="1" placeholder="e.g. 1"></div>
    </div>
    <div class="frow"><label>Excerpt <span style="font-weight:400;color:var(--gd)">(optional)</span></label><textarea id="f-e" rows="2" placeholder="Auto-generated if blank"></textarea></div>
    <p class="import-note">Use the toolbar to format your writing. Existing formatted posts open here with their formatting preserved.</p>
    <div class="frow"><label>Body</label>
      <div class="rich-editor">
        <div class="rich-toolbar" aria-label="Text formatting tools">
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('bold')" title="Bold"><strong>B</strong></button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('italic')" title="Italic"><em>I</em></button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('underline')" title="Underline"><u>U</u></button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richFontSize('decrease')" title="Decrease font size">A−</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richFontSize('increase')" title="Increase font size">A+</button>
          <select onmousedown="captureRichSelection()" onchange="richBlock(this.value);this.value=''" title="Text style">
            <option value="">Text style</option><option value="p">Normal text</option><option value="h2">Large heading</option><option value="h3">Medium heading</option><option value="h4">Small heading</option>
          </select>
          <span class="rich-toolbar__break"></span>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('insertUnorderedList')" title="Bulleted list">• List</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('insertOrderedList')" title="Numbered list">1. List</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('outdent')" title="Decrease list indentation">⇤</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('indent')" title="Indent list item / create a sub-list">⇥</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('formatBlock','blockquote')" title="Quote">❝</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('formatBlock','pre')" title="Code block">&lt;/&gt;</button>
          <span class="rich-toolbar__break"></span>
          <button type="button" onmousedown="event.preventDefault()" onclick="richLink()" title="Add link">🔗</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richImage()" title="Add image from a link">🖼</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richClearFormatting()" title="Clear selected formatting">Tx</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('undo')" title="Undo">↶</button>
          <button type="button" onmousedown="event.preventDefault()" onclick="richCommand('redo')" title="Redo">↷</button>
        </div>
        <div id="f-b" class="rich-editor__body" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Write your post here..." oninput="captureRichSelection()" onkeyup="captureRichSelection()" onmouseup="captureRichSelection()" onfocus="captureRichSelection()" onpaste="richPastePlainText(event)"></div>
      </div>
      <p class="rich-editor__hint">For a sub-list, make a list first, then place the cursor in an item and use ⇥.</p>
    </div>
    <div class="fbts"><button class="savebtn" onclick="savePost()">💾 Save</button><button class="cancelbtn" onclick="cancelForm()">Cancel</button></div>
  </div>`
}
function startAdd(){editId=null;document.getElementById('afw').innerHTML=buildFormHtml();document.getElementById('f-d').value=todayStr();document.getElementById('afw').scrollIntoView({behavior:'smooth',block:'start'})}
function startEdit(id){
  editId=id;const p=POSTS.find(x=>x.id===id);if(!p)return;
  document.getElementById('afw').innerHTML=buildFormHtml();
  document.getElementById('f-t').value=p.title;document.getElementById('f-d').value=p.date;
  document.getElementById('f-e').value=p.exc||'';setRichEditorContent(p);document.getElementById('f-co').value=Number(p.collectionOrder)>0?p.collectionOrder:'';
  document.getElementById('afw').scrollIntoView({behavior:'smooth',block:'start'})
}
function cancelForm(){document.getElementById('afw').innerHTML='';editId=null}
async function savePost(){
  const title=document.getElementById('f-t').value.trim(),langV=document.getElementById('f-l').value;
  const catKey=document.getElementById('f-c').value,subcat=document.getElementById('f-sc').value;
  const date=document.getElementById('f-d').value.trim(),exc=document.getElementById('f-e').value.trim();
  const body=richEditorText(),html=richEditorHtml(),collectionId=document.getElementById('f-col').value,collectionOrder=Number.parseInt(document.getElementById('f-co').value,10);
  if(!title||!catKey||!body){alert('Title, Category, and Body are required.');return}
  const previous=editId?POSTS.find(x=>x.id===editId):null;
  const post={...(previous||{}),id:editId||Date.now(),title,lang:langV,lc:LC[langV]||'kn',cat:CATS[catKey].label,cc:catKey,subcat:subcat||'',collectionId,collectionOrder:collectionId&&Number.isInteger(collectionOrder)&&collectionOrder>0?collectionOrder:null,date:date||todayStr(),exc:exc||autoExc(body),body,html};
  try{
    await svP(post);
    if(editId){const i=POSTS.findIndex(x=>x.id===editId);if(i>=0)POSTS[i]=post}else POSTS.unshift(post);
    cancelForm();renderAdPosts();renderHome();
  }catch(e){console.error('Post save failed:',e);alert('The post could not be saved. Please try again.')}
}

// ── ADMIN: COLLECTIONS ─────────────────────────────────
function sortCollections(){COLLECTIONS.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'kn'))}
function renderAdCollections(){
  const el=document.getElementById('cpl');
  if(!COLLECTIONS.length){el.innerHTML='<div class="empty">No collections yet. Create one, then assign writings to it from the post editor.</div>';return}
  el.innerHTML=COLLECTIONS.map(collection=>{
    const count=collectionPosts(collection.id).length;
    return`<div class="apost">
      <div class="apost-info"><div class="apost-title">${esc(collection.icon||'✦')} ${esc(collection.title)}</div><div class="apost-meta">${count} ${count===1?'writing':'writings'}${collection.description?' · '+esc(collection.description):''}</div></div>
      <div class="apost-acts" id="cda${collection.id}"><button class="editbtn" onclick="startEditCollection(${collection.id})">Edit</button><button class="delbtn" onclick="askDelCollection(${collection.id})">Delete</button></div>
    </div>`
  }).join('');
}
function collectionFormHtml(){
  const collection=collectionEditId?findCollection(collectionEditId):null;
  return`<div class="aform"><h3>${collection?'Edit Collection':'New Collection'}</h3>
    <div class="frow2"><div class="frow"><label>Collection name</label><input type="text" id="cf-t" maxlength="100" placeholder="e.g. ನನ್ನ ಕವನಗಳು"></div><div class="frow"><label>Icon</label><input type="text" id="cf-i" maxlength="12" placeholder="e.g. 🌸"></div></div>
    <div class="frow"><label>Description <span style="font-weight:400;color:var(--gd)">(optional)</span></label><textarea id="cf-d" rows="3" maxlength="400" placeholder="A short introduction to this collection..."></textarea></div>
    <p class="import-note">Assign writings and their reading order from each post’s editor. The first item leads to the next automatically.</p>
    <div class="fbts"><button class="savebtn" onclick="saveCollection()">💾 Save Collection</button><button class="cancelbtn" onclick="cancelCollectionForm()">Cancel</button></div>
  </div>`
}
function startAddCollection(){
  collectionEditId=null;document.getElementById('cfw').innerHTML=collectionFormHtml();document.getElementById('cf-i').value='✦';document.getElementById('cfw').scrollIntoView({behavior:'smooth',block:'start'});
}
function startEditCollection(id){
  const collection=findCollection(id);if(!collection)return;
  collectionEditId=id;document.getElementById('cfw').innerHTML=collectionFormHtml();document.getElementById('cf-t').value=collection.title||'';document.getElementById('cf-i').value=collection.icon||'✦';document.getElementById('cf-d').value=collection.description||'';document.getElementById('cfw').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelCollectionForm(){document.getElementById('cfw').innerHTML='';collectionEditId=null}
async function saveCollection(){
  const title=document.getElementById('cf-t')?.value.trim(),icon=document.getElementById('cf-i')?.value.trim(),description=document.getElementById('cf-d')?.value.trim()||'';
  if(!title){alert('Please enter a collection name.');return}
  const existing=collectionEditId?findCollection(collectionEditId):null;
  const collection={...(existing||{}),id:existing?.id||Date.now(),title,icon:(icon||'✦').slice(0,12),description};
  try{
    await svCol(collection);
    if(existing){const index=COLLECTIONS.findIndex(item=>String(item.id)===String(existing.id));if(index>=0)COLLECTIONS[index]=collection}else COLLECTIONS.push(collection);
    sortCollections();cancelCollectionForm();renderAdCollections();renderHome();
  }catch(error){console.error('Collection save failed:',error);alert('The collection could not be saved. Please try again.')}
}
function askDelCollection(id){
  const el=document.getElementById('cda'+id);if(!el)return;
  el.innerHTML=`<span style="font-size:.78rem;color:var(--il)">Writings stay published but become ungrouped.</span><button class="delbtn hot" onclick="delCollection(${id})">Delete</button><button class="cancelbtn" style="padding:5px 10px;font-size:.8rem" onclick="renderAdCollections()">Cancel</button>`;
}
async function delCollection(id){
  const collection=findCollection(id);if(!collection)return;
  const affected=POSTS.filter(post=>String(post.collectionId||'')===String(id)),postSnapshots=affected.map(post=>({...post})),collectionsSnapshot=[...COLLECTIONS];
  affected.forEach(post=>{post.collectionId='';post.collectionOrder=null});COLLECTIONS=COLLECTIONS.filter(item=>String(item.id)!==String(id));
  try{
    await Promise.all([...affected.map(svP),window.deleteFirestoreCollection(collection)]);
    cancelCollectionForm();renderAdCollections();renderAdPosts();renderHome();
  }catch(error){
    postSnapshots.forEach(snapshot=>{const index=POSTS.findIndex(post=>String(post.id)===String(snapshot.id));if(index>=0)POSTS[index]=snapshot});
    COLLECTIONS=collectionsSnapshot;console.error('Collection deletion failed:',error);alert('The collection could not be deleted. Please try again.');renderAdCollections();
  }
}

// ── ADMIN: LIBRARY ─────────────────────────────────────
function sortLibraryBooks(){BOOKS.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'kn'))}
function libraryAdminStatus(book){
  if(book.lendingPolicy==='reference')return'Reference only';
  return{available:'Available',reserved:'Reserved',borrowed:'Borrowed',unavailable:'Unavailable'}[book.status]||'Available';
}
function libraryDate(value){
  if(!value)return'—';
  const date=typeof value?.toDate==='function'?value.toDate():value?.seconds?new Date(value.seconds*1000):new Date(value);
  return Number.isNaN(date.valueOf())?String(value):date.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
}
function libraryDateValue(value){
  if(!value)return 0;
  const date=typeof value?.toDate==='function'?value.toDate():value?.seconds?new Date(value.seconds*1000):new Date(value);
  return Number.isNaN(date.valueOf())?0:date.valueOf();
}
async function loadAdminLibrary(){
  if(libraryAdminLoading)return;
  const books=document.getElementById('libpl'),requests=document.getElementById('librl');
  if(books)books.innerHTML='<div class="empty">Loading books...</div>';
  if(requests)requests.innerHTML='<div class="empty">Loading requests...</div>';
  libraryAdminLoading=true;
  try{
    const [freshBooks,freshRequests]=await Promise.all([
      window.getFirestoreLibraryBooks?window.getFirestoreLibraryBooks():Promise.resolve(BOOKS),
      window.getFirestoreLibraryRequests?window.getFirestoreLibraryRequests():Promise.resolve([]),
    ]);
    BOOKS=freshBooks;libraryRequests=freshRequests;libraryLoading=false;sortLibraryBooks();renderAdLibraryBooks();renderAdLibraryRequests();
  }catch(error){console.error('Admin library load failed:',error);if(books)books.innerHTML='<div class="empty">Library data could not be loaded.</div>';if(requests)requests.innerHTML=''}
  finally{libraryAdminLoading=false}
}
function renderAdLibraryBooks(){
  const el=document.getElementById('libpl');if(!el)return;
  if(!BOOKS.length){el.innerHTML='<div class="empty">No books yet. Add the first book above.</div>';return}
  el.innerHTML=BOOKS.map(book=>`<div class="apost">
    <div class="apost-info"><div class="apost-title">📚 ${esc(book.title)}</div><div class="apost-meta">${esc(book.author||'Author not set')} · ${esc(libraryAdminStatus(book))}${book.shelf?' · '+esc(book.shelf):''}</div></div>
    <div class="apost-acts"><button class="editbtn" onclick="copyLibraryBookLink(${jsArg(book.id)})">Copy Link</button><button class="editbtn" onclick="startEditLibraryBook(${jsArg(book.id)})">Edit</button><button class="delbtn" onclick="deleteLibraryBook(${jsArg(book.id)})">Delete</button></div>
  </div>`).join('');
}
function libraryBookFormHtml(){
  const book=bookEditId?findBook(bookEditId):null;
  return`<div class="aform"><h3>${book?'Edit Book':'New Book'}</h3>
    <div class="frow2"><div class="frow"><label>Title</label><input id="libf-title" type="text" maxlength="160"></div><div class="frow"><label>Author</label><input id="libf-author" type="text" maxlength="120"></div></div>
    <div class="frow2"><div class="frow"><label>Language</label><input id="libf-language" type="text" maxlength="60" placeholder="e.g. ಕನ್ನಡ"></div><div class="frow"><label>Category</label><input id="libf-category" type="text" maxlength="80" placeholder="e.g. ಕಾದಂಬರಿ"></div></div>
    <div class="frow2"><div class="frow"><label>Publisher</label><input id="libf-publisher" type="text" maxlength="120"></div><div class="frow"><label>Published year</label><input id="libf-year" type="text" maxlength="12"></div></div>
    <div class="frow2"><div class="frow"><label>ISBN / Barcode</label><input id="libf-isbn" type="text" maxlength="32"></div><div class="frow"><label>Shelf / Location</label><input id="libf-shelf" type="text" maxlength="80" placeholder="e.g. Cupboard A · Shelf 2"></div></div>
    <div class="frow"><label>Cover image URL <span style="font-weight:400;color:var(--gd)">(optional)</span></label><input id="libf-cover" type="url" maxlength="1000" placeholder="https://..."></div>
    <div class="frow"><label>Description <span style="font-weight:400;color:var(--gd)">(optional)</span></label><textarea id="libf-description" rows="4" maxlength="1200"></textarea></div>
    <div class="frow2"><div class="frow"><label>Lending</label><select id="libf-policy"><option value="lendable">Visitors may request</option><option value="reference">Reference only — no lending</option></select></div><div class="frow"><label>Availability</label><select id="libf-status"><option value="available">Available</option><option value="reserved">Reserved</option><option value="borrowed">Borrowed</option><option value="unavailable">Unavailable</option></select></div></div>
    <div class="fbts"><button class="savebtn" onclick="saveLibraryBook()">💾 Save Book</button><button class="cancelbtn" onclick="cancelLibraryBookForm()">Cancel</button></div>
  </div>`;
}
function startAddLibraryBook(){
  bookEditId=null;document.getElementById('libfw').innerHTML=libraryBookFormHtml();document.getElementById('libf-language').value='ಕನ್ನಡ';document.getElementById('libfw').scrollIntoView({behavior:'smooth',block:'start'});
}
function startEditLibraryBook(id){
  const book=findBook(id);if(!book)return;bookEditId=id;document.getElementById('libfw').innerHTML=libraryBookFormHtml();
  const values={title:book.title,author:book.author,language:book.language,category:book.category,publisher:book.publisher,year:book.year,isbn:book.isbn,shelf:book.shelf,cover:book.coverImage,description:book.description};
  Object.entries(values).forEach(([key,value])=>{const input=document.getElementById('libf-'+key);if(input)input.value=value||''});
  document.getElementById('libf-policy').value=book.lendingPolicy||'lendable';document.getElementById('libf-status').value=book.status||'available';document.getElementById('libfw').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelLibraryBookForm(){const el=document.getElementById('libfw');if(el)el.innerHTML='';bookEditId=null}
async function saveLibraryBook(){
  const value=id=>document.getElementById(id)?.value.trim()||'',title=value('libf-title'),author=value('libf-author'),coverImage=value('libf-cover');
  if(!title||!author){alert('Title and Author are required.');return}
  if(coverImage&&!safeContentUrl(coverImage)){alert('Please enter a valid http or https cover image URL.');return}
  const existing=bookEditId?findBook(bookEditId):null;
  const book={...(existing||{}),id:existing?.id||Date.now(),title,author,language:value('libf-language'),category:value('libf-category'),publisher:value('libf-publisher'),year:value('libf-year'),isbn:value('libf-isbn'),shelf:value('libf-shelf'),coverImage,description:value('libf-description'),lendingPolicy:document.getElementById('libf-policy')?.value||'lendable',status:document.getElementById('libf-status')?.value||'available'};
  try{
    await window.saveFirestoreLibraryBook(book);
    if(existing){const index=BOOKS.findIndex(item=>String(item.id)===String(existing.id));if(index>=0)BOOKS[index]=book}else BOOKS.push(book);
    sortLibraryBooks();cancelLibraryBookForm();renderAdLibraryBooks();renderLibrary();
  }catch(error){console.error('Book save failed:',error);alert('The book could not be saved. Please try again.')}
}
async function deleteLibraryBook(id){
  const book=findBook(id);if(!book)return;
  const active=libraryRequests.some(request=>String(request.bookId)===String(id)&&['requested','approved','borrowed'].includes(request.status));
  if(active){alert('This book has an active request or loan. Close it before deleting the book.');return}
  if(!confirm(`Delete “${book.title}” permanently?`))return;
  try{await window.deleteFirestoreLibraryBook(book);BOOKS=BOOKS.filter(item=>String(item.id)!==String(id));renderAdLibraryBooks();renderLibrary()}
  catch(error){console.error('Book deletion failed:',error);alert('The book could not be deleted. Please try again.')}
}
async function copyLibraryBookLink(id){
  const url=new URL(routePath('book',id),location.origin).href;
  try{await navigator.clipboard.writeText(url);alert('Permanent book link copied. Use this link in your QR code.')}
  catch(error){window.prompt('Copy this permanent book link:',url)}
}
function renderAdLibraryRequests(){
  const el=document.getElementById('librl');if(!el)return;
  if(!libraryRequests.length){el.innerHTML='<div class="empty">No borrowing requests yet.</div>';return}
  const priority={requested:0,approved:1,borrowed:2,returned:3,rejected:4};
  const requests=[...libraryRequests].sort((a,b)=>(priority[a.status]??9)-(priority[b.status]??9)||libraryDateValue(b.requestedAt)-libraryDateValue(a.requestedAt));
  const labels={requested:'Requested',approved:'Approved',borrowed:'Borrowed',returned:'Returned',rejected:'Rejected'};
  el.innerHTML=requests.map(request=>{
    const requestId=jsArg(request.firestoreId),bookId=jsArg(request.bookId),book=findBook(request.bookId),status=request.status||'requested';
    let actions='';
    if(status==='requested')actions=`<button class="editbtn" onclick="adminLibraryRequestAction(${requestId},'approved')">Approve</button><button class="delbtn" onclick="adminLibraryRequestAction(${requestId},'rejected')">Reject</button>`;
    else if(status==='approved')actions=`<button class="editbtn" onclick="adminLibraryRequestAction(${requestId},'borrowed')">Issue Book</button><button class="delbtn" onclick="adminLibraryRequestAction(${requestId},'rejected')">Reject</button>`;
    else if(status==='borrowed')actions=`<button class="editbtn" onclick="adminLibraryRequestAction(${requestId},'returned')">Mark Returned</button>`;
    else actions=`<button class="delbtn" onclick="deleteLibraryRequest(${requestId})">Delete Record</button>`;
    return`<div class="library-admin-request"><div class="library-admin-request__main"><div><strong>${esc(request.bookTitle||book?.title||'Unknown book')}</strong> <span class="library-admin-badge ${esc(status)}">${labels[status]||esc(status)}</span></div><p><strong>${esc(request.name||'—')}</strong> · ${esc(request.contact||'—')}</p>${request.message?`<p>${esc(request.message)}</p>`:''}<small>Requested: ${esc(libraryDate(request.requestedAt))}${request.dueDate?' · Due: '+esc(request.dueDate):''}</small></div><div class="apost-acts">${actions}<button class="editbtn" onclick="copyLibraryBookLink(${bookId})">Book Link</button></div></div>`;
  }).join('');
}
async function adminLibraryRequestAction(requestId,nextStatus){
  const request=libraryRequests.find(item=>String(item.firestoreId)===String(requestId));if(!request)return;
  const book=findBook(request.bookId);if(!book){alert('The linked book no longer exists.');return}
  if(nextStatus==='approved'&&libraryBookState(book).key!=='available'){alert('This book is not currently available.');return}
  let bookStatus=null,details={};
  if(nextStatus==='approved'){bookStatus='reserved';details.approvedAt=new Date().toISOString()}
  else if(nextStatus==='borrowed'){
    const suggested=new Date(Date.now()+14*86400000).toISOString().slice(0,10),dueDate=window.prompt('Return due date (YYYY-MM-DD):',suggested);if(dueDate===null)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())){alert('Please enter the due date as YYYY-MM-DD.');return}
    bookStatus='borrowed';details={loanedAt:new Date().toISOString(),dueDate:dueDate.trim()};
  }else if(nextStatus==='returned'){bookStatus='available';details.returnedAt=new Date().toISOString()}
  else if(nextStatus==='rejected'){bookStatus=request.status==='approved'?'available':null;details.rejectedAt=new Date().toISOString()}
  try{
    await window.setFirestoreLibraryRequestStatus(request.firestoreId,request.bookId,nextStatus,bookStatus,details);
    Object.assign(request,{status:nextStatus,...details});if(bookStatus)book.status=bookStatus;renderAdLibraryRequests();renderAdLibraryBooks();renderLibrary();
  }catch(error){console.error('Library request update failed:',error);alert('The request could not be updated. Please try again.')}
}
async function deleteLibraryRequest(requestId){
  const request=libraryRequests.find(item=>String(item.firestoreId)===String(requestId));if(!request||!['returned','rejected'].includes(request.status))return;
  if(!confirm('Delete this closed request record permanently?'))return;
  try{await window.deleteFirestoreLibraryRequest(request.firestoreId);libraryRequests=libraryRequests.filter(item=>String(item.firestoreId)!==String(requestId));renderAdLibraryRequests()}
  catch(error){console.error('Library request deletion failed:',error);alert('The request record could not be deleted.')}
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
const adminQuizInvitations=new Map();
function adminShareQuiz(id){return Q&&String(Q.id)===String(id)?Q:findQuiz(id)}
function rememberAdminQuizInvitation(){
  const panel=document.getElementById('admin-quiz-share'),input=document.getElementById('admin-quiz-invitation');
  if(adminAuth&&panel&&input)adminQuizInvitations.set(panel.dataset.quizId,input.value);
}
function openAdminQuizShare(id){
  if(!adminAuth)return;
  const quiz=adminShareQuiz(id),host=document.getElementById('qshare');
  if(!quiz||!host)return;
  const key=String(quiz.id),url=new URL(routePath('qdetail',quiz.id),location.origin).href;
  const introduction=quiz.state==='live'?'Join my quiz!':quiz.state==='upcoming'?'A new quiz is coming soon!':'Explore this quiz!';
  const invitation=adminQuizInvitations.get(key)??[introduction,quiz.title,quiz.description||''].filter(Boolean).join('\n\n');
  host.innerHTML=`<section class="admin-quiz-share" id="admin-quiz-share" data-quiz-id="${esc(key)}" aria-labelledby="admin-quiz-share-heading">
    <div class="admin-quiz-share__head"><h4 id="admin-quiz-share-heading">Share Quiz</h4><button type="button" class="cancelbtn" onclick="document.getElementById('qshare').innerHTML=''">Close</button></div>
    <p class="admin-quiz-share__title">${esc(quiz.title)}</p>
    <div class="frow"><label for="admin-quiz-link">Quiz link</label><input id="admin-quiz-link" type="url" readonly value="${esc(url)}" onclick="this.select()"></div>
    <div class="frow"><label for="admin-quiz-invitation">Invitation text</label><textarea id="admin-quiz-invitation" rows="6" oninput="rememberAdminQuizInvitation()" aria-describedby="admin-quiz-share-help">${esc(invitation)}</textarea></div>
    <p id="admin-quiz-share-help" class="admin-quiz-share__help">Edit your invitation in any language. The quiz link is added automatically when you copy or share the invitation.</p>
    <div class="qacts"><button type="button" class="qa qa-sub" onclick="copyAdminQuizShare('link')">Copy link</button><button type="button" class="qa qa-sub" onclick="copyAdminQuizShare('invitation')">Copy invitation + link</button><button type="button" class="qa qa-go" id="admin-quiz-share-send" onclick="sendAdminQuizShare()">↗ Share…</button></div>
    <p class="admin-quiz-share__status" id="admin-quiz-share-status" role="status" aria-live="polite"></p>
    <div class="frow" id="admin-quiz-share-manual" hidden><label for="admin-quiz-share-copy">Press and hold to copy this text</label><textarea id="admin-quiz-share-copy" readonly rows="5"></textarea></div>
  </section>`;
  const panel=document.getElementById('admin-quiz-share');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function adminQuizShareData(){
  const panel=document.getElementById('admin-quiz-share');
  if(!adminAuth||!panel)return null;
  const quiz=adminShareQuiz(panel.dataset.quizId);
  if(!quiz)return null;
  const url=new URL(routePath('qdetail',quiz.id),location.origin).href;
  const invitation=document.getElementById('admin-quiz-invitation').value.trim();
  // Keep the link within the shared text so text-only destinations receive it too.
  const text=invitation?(invitation.includes(url)?invitation:invitation+'\n\n'+url):url;
  return {title:quiz.title||'A quiz by DK',url,text};
}
async function copyAdminQuizShare(kind){
  const data=adminQuizShareData();
  if(!data)return;
  const text=kind==='link'?data.url:data.text;
  const status=document.getElementById('admin-quiz-share-status'),manual=document.getElementById('admin-quiz-share-manual'),copy=document.getElementById('admin-quiz-share-copy');
  status.textContent='';manual.hidden=true;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    status.textContent=kind==='link'?'Quiz link copied.':'Invitation and quiz link copied.';
  }catch(error){
    status.textContent='Automatic copying is unavailable. Select the text below and copy it.';
    manual.hidden=false;copy.value=text;copy.focus();copy.select();
  }
}
async function sendAdminQuizShare(){
  const data=adminQuizShareData();
  if(!data)return;
  const status=document.getElementById('admin-quiz-share-status'),button=document.getElementById('admin-quiz-share-send');
  if(button.disabled)return;
  if(!navigator.share){
    status.textContent='Use Copy invitation + link, then paste it into the app you want to share with.';
    return;
  }
  status.textContent='';button.disabled=true;
  try{
    await navigator.share({title:data.title,text:data.text});
    status.textContent='Invitation passed to your chosen app.';
  }catch(error){
    if(error.name!=='AbortError')status.textContent='Sharing could not open. Use Copy invitation + link instead.';
  }finally{button.disabled=false}
}
function renderAdQuiz(){
  const el=document.getElementById('atab-quiz');
  const badge=Q?({upcoming:'<span class="badge bup">Upcoming</span>',live:'<span class="badge blive">Live</span>',closed:'<span class="badge bcl">Closed</span>'}[Q.state]||''):'<span class="badge bno">No active quiz</span>';
  let statusHtml=`<div class="qstatus">
    <div class="qstatus-head"><h4>${Q?esc(Q.title):'Quiz Status'}</h4>${badge}${Q?`<span style="font-size:.74rem;color:var(--gd)">${Q.type==='prize'?'🎁 Prize':'📜 Certificate'} · ${Q.questions?.length||0} Qs</span>`:''}</div>
    ${Q?.state==='live'?'<p class="quiz-live-count" id="q-live-count">Loading participant count…</p>':''}
    ${Q?`<div class="qacts">
      <button class="editbtn" onclick="startEditQuiz()">Edit</button>
      <button type="button" class="qa qa-sub" onclick="openAdminQuizShare(${Q.id})">↗ Share Quiz</button>
      ${Q.state==='upcoming'?`<button class="qa qa-go" onclick="setQState('live')">▶ Go Live</button>`:''}
       ${Q.state==='live'?`<button class="qa qa-cl" onclick="setQState('closed')">■ Close Quiz</button>`:''}
       ${Q.state==='closed'?`<button class="qa qa-arc" onclick="doArchive()">Archive Quiz</button>`:''}
       <button class="qa qa-sub" onclick="viewQuizSubmissions(${Q.id})">👥 Participant Status</button>
       ${Q.type==='prize'?`<button class="qa qa-sub" onclick="viewPrizeEntries(${Q.id})">📋 Prize Entries</button>`:''}
      <button class="delbtn" onclick="askDelQ()">Delete</button>
    </div>`:`<button class="addbtn" style="margin-bottom:0;margin-top:10px" onclick="startCreateQuiz()">+ Create Quiz</button>`}
  </div>`;
  el.innerHTML=statusHtml+'<div id="qshare"></div><div id="qfw"></div><div id="qsv"></div><div id="qsubs"></div>'+
    `<div style="margin-top:28px"><h4 style="font-family:'Playfair Display',serif;color:var(--ac);margin-bottom:14px;font-size:1rem">Archive (${QA.length})</h4>
    ${QA.length?QA.map(q=>`<div class="apost">
      <div class="apost-info"><div class="apost-title">${esc(q.title)}</div><div class="apost-meta">${q.date} · ${q.total} participants</div></div>
      <div class="apost-acts"><button type="button" class="editbtn" onclick="openAdminQuizShare(${q.id})">↗ Share</button>${q.type==='prize'?`<button class="editbtn" onclick="viewPrizeEntries(${q.id})">Entries</button>`:''}<button class="editbtn" onclick="repeatArchivedQuiz(${q.id})">↻ Repeat</button><button class="delbtn" onclick="delArcQ(${q.id})">Delete</button></div>
    </div>`).join(''):'<div class="empty" style="padding:14px">No archived quizzes yet.</div>'}
    </div>`;
  if(Q?.state==='live')loadLiveQuizCount(Q.id)
}
async function loadLiveQuizCount(quizId){
  const el=document.getElementById('q-live-count');
  if(!el||!window.getFirestoreQuizSubmissions)return;
  try{
    const submissions=await window.getFirestoreQuizSubmissions(quizId);
    if(Q&&String(Q.id)===String(quizId))el.textContent=`👥 ${submissions.length} participant${submissions.length===1?'':'s'} so far`;
  }catch(error){
    console.error('Live participant count failed:',error);
    if(el)el.textContent='Participant count is unavailable right now.';
  }
}
async function setQState(s){
  if(!Q)return;
  const old=Q.state;Q.state=s;
  try{await svQ();renderAdQuiz()}catch(e){Q.state=old;console.error('Quiz save failed:',e);alert('The quiz state could not be saved. Please try again.')}
}
async function doArchive(){
  if(!Q||Q.state!=='closed')return;
  if(!window.getFirestoreQuizSubmissions){
    alert('Quiz response data is not ready. Please refresh and try again.');
    return;
  }
  let submissions;
  try{submissions=await window.getFirestoreQuizSubmissions(Q.id)}
  catch(error){console.error('Quiz response load failed:',error);alert('Quiz response data could not be loaded. Please try again.');return}
  const stats={total:submissions.length,qs:{}};
  submissions.forEach(submission=>{
    const answers=Array.isArray(submission.answers)?submission.answers:[];
    Q.questions.forEach((qu,i)=>{
      if(!stats.qs[i])stats.qs[i]={c:0,w:0};
      if(answers[i]===qu.ans)stats.qs[i].c++;else stats.qs[i].w++;
    });
  });
  const archive={id:Q.id,title:Q.title,description:Q.description||'',date:Q.date,deadline:Q.deadline||'',prize:Q.prize||'',type:Q.type,total:stats.total,state:'archived',certificateTemplate:Q.certificateTemplate||null,
    questions:Q.questions.map((qu,i)=>({...qu,stats:stats.qs[i]||{c:0,w:0}}))};
  try{
    await window.saveFirestoreQuizArchive(archive);
    Q=null;await svQ();QA.unshift(archive);renderAdQuiz();
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
  const current=Q;Q=null;
  try{await svQ();renderAdQuiz()}catch(e){Q=current;console.error('Quiz deletion failed:',e);alert('The quiz could not be deleted. Please try again.')}
}
function quizSubmissionScore(quiz,answers){
  const submitted=Array.isArray(answers)?answers:[];
  return (quiz.questions||[]).reduce((score,question,index)=>score+(submitted[index]===question.ans?1:0),0);
}
function participantTimestamp(participant){
  return (participant.submittedAt?.seconds||0)*1000000000+(participant.submittedAt?.nanoseconds||0);
}
function setParticipantSort(field){
  if(!participantStatus)return;
  participantSort=participantSort.field===field
    ?{field,direction:participantSort.direction==='desc'?'asc':'desc'}
    :{field,direction:'desc'};
  renderParticipantStatus();
}
function renderParticipantStatus(){
  const el=document.getElementById('qsubs'),data=participantStatus;
  if(!el||!data)return;
  const {quiz,participants}=data,total=(quiz.questions||[]).length,direction=participantSort.direction==='asc'?1:-1;
  const sorted=[...participants].sort((a,b)=>{
    const primary=participantSort.field==='score'?a.score-b.score:participantTimestamp(a)-participantTimestamp(b);
    if(primary)return primary*direction;
    return participantSort.field==='score'?participantTimestamp(b)-participantTimestamp(a):b.score-a.score;
  });
  const arrow=field=>participantSort.field===field?(participantSort.direction==='desc'?'↓':'↑'):'↕';
  el.innerHTML=`<div class="participant-status-head"><h4>Participant Status (${participants.length})</h4><span>Click Score or Submitted to sort.</span></div>
    <div class="participant-table"><div class="participant-table__header"><span>Name</span><button class="participant-sort" onclick="setParticipantSort('score')">Score ${arrow('score')}</button><button class="participant-sort" onclick="setParticipantSort('submitted')">Submitted ${arrow('submitted')}</button></div>
    ${sorted.map(participant=>{
      const when=participant.submittedAt?.toDate?participant.submittedAt.toDate().toLocaleString():'—';
      return`<div class="participant-row"><strong>${esc(participant.name)}</strong><span><strong>${participant.score}/${total}</strong></span><time>${esc(when)}</time></div>`
    }).join('')}</div>`;
}
async function viewQuizSubmissions(quizId){
  const el=document.getElementById('qsubs');
  const quiz=Q&&String(Q.id)===String(quizId)?Q:QA.find(item=>String(item.id)===String(quizId));
  if(!quiz||!window.getFirestoreQuizSubmissions){
    el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">Participant status is not available.</p>';
    return;
  }
  participantStatus=null;
  el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">Loading participant status…</p>';
  try{
    const [submissions,entries]=await Promise.all([
      window.getFirestoreQuizSubmissions(quizId),
      quiz.type==='prize'&&window.getFirestorePrizeQuizEntries?window.getFirestorePrizeQuizEntries(quizId):Promise.resolve([])
    ]);
    const prizeNames=new Map(entries.map(entry=>[entry.userId,entry.name]));
    const participants=submissions.map(submission=>({
      name:submission.participantName||prizeNames.get(submission.userId)||'Name not recorded',
      score:quizSubmissionScore(quiz,submission.answers),
      submittedAt:submission.submittedAt,
    }));
    if(participants.length){
      participantStatus={quiz,participants};
      participantSort={field:'score',direction:'desc'};
      renderParticipantStatus();
    }else{
      el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">No one has participated yet.</p>';
    }
  }catch(error){
    console.error('Participant status load failed:',error);
    el.innerHTML='<p style="color:#b23b35;padding:12px 0;font-size:.88rem">Participant status could not be loaded. Please try again.</p>';
  }
}
async function viewPrizeEntries(quizId){
  const el=document.getElementById('qsubs');
  const quiz=Q&&String(Q.id)===String(quizId)?Q:QA.find(item=>String(item.id)===String(quizId));
  if(!quiz||!window.getFirestorePrizeQuizEntries||!window.getFirestoreQuizSubmissions){
    el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">Prize entries are not available.</p>';
    return;
  }
  el.innerHTML='<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">Loading prize entries…</p>';
  try{
    const [entries,submissions]=await Promise.all([
      window.getFirestorePrizeQuizEntries(quizId),
      window.getFirestoreQuizSubmissions(quizId),
    ]);
    const answersByUser=new Map(submissions.map(submission=>[submission.userId,submission.answers]));
    entries.sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0));
    el.innerHTML=entries.length?`<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
      <h4 style="font-family:'Playfair Display',serif;color:var(--ac);font-size:1rem">Prize Entries (${entries.length})</h4>
    </div><div class="subslist">${entries.map(entry=>{
      const answers=Array.isArray(answersByUser.get(entry.userId))?answersByUser.get(entry.userId):[];
      const score=quiz.questions.reduce((total,question,index)=>total+(answers[index]===question.ans?1:0),0);
      const when=entry.submittedAt?.toDate?entry.submittedAt.toDate().toLocaleString():'—';
      return`<div class="subrow"><strong>${esc(entry.name||'—')}</strong> · ${esc(entry.contact||'—')} · Score: <strong>${score}/${quiz.questions.length}</strong> · ${esc(when)}</div>`
    }).join('')}</div>`:'<p style="color:var(--gd);font-style:italic;padding:12px 0;font-size:.88rem">No prize entries yet.</p>';
  }catch(error){
    console.error('Prize entries load failed:',error);
    el.innerHTML='<p style="color:#b23b35;padding:12px 0;font-size:.88rem">Prize entries could not be loaded. Please try again.</p>';
  }
}
async function delArcQ(id){
  try{await window.deleteFirestoreQuizArchive(id);QA=QA.filter(q=>q.id!==id);renderAdQuiz()}
  catch(e){console.error('Quiz archive deletion failed:',e);alert('The archived quiz could not be deleted. Please try again.')}
}
function repeatArchivedQuiz(id){
  const archived=findQuiz(id);
  if(!archived)return;
  if(Q){
    alert('Close and archive the current quiz before creating a repeat.');
    return;
  }
  editQId=false;
  qDraft=(archived.questions||[]).map(({stats,...question})=>JSON.parse(JSON.stringify(question)));
  certDraft=certificateTemplate(archived.certificateTemplate);
  document.getElementById('qfw').innerHTML=buildQForm();
  document.getElementById('qf-t').value=archived.title?archived.title+' — Repeat':'Repeat Quiz';
  document.getElementById('qf-d').value=archived.description||'';
  document.getElementById('qf-type').value=archived.type||'certificate';
  document.getElementById('qf-state').value='upcoming';
  document.getElementById('qf-date').value=todayStr();
  document.getElementById('qf-dl').value='';
  document.getElementById('qf-pr').value=archived.prize||'';
  renderQBuilder();toggleCertificateDesigner();document.getElementById('qfw').scrollIntoView({behavior:'smooth',block:'start'});
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
function certificateDesignerMarkup(){
  const t=certificateTemplate(certDraft),fontOptions=Object.keys(CERT_FONT_STACKS).map(font=>`<option value="${font}"${t.font===font?' selected':''}>${font}</option>`).join(''),
    titleFontOptions=Object.keys(CERT_FONT_STACKS).map(font=>`<option value="${font}"${t.titleFont===font?' selected':''}>${font}</option>`).join('');
  return`<section id="certificate-designer" class="certificate-designer">
    <div class="certificate-designer__head">
      <div><h4>Certificate design</h4><p>Use a ready-made style or make it your own. The preview uses sample participant details.</p></div>
      <span class="certificate-kind">📜 Certificate quiz</span>
    </div>
    <p class="certificate-placeholders">Placeholders: <code>{name}</code>, <code>{quizTitle}</code>, <code>{score}</code>, <code>{total}</code>, <code>{percent}</code>, <code>{date}</code></p>
    <div class="certificate-designer-grid">
      <div class="frow"><label>Top symbol or text</label><input type="text" id="cd-emblem" maxlength="80" value="${esc(t.emblem)}" oninput="certPreview()"></div>
      <div class="frow"><label>Heading</label><input type="text" id="cd-heading" maxlength="160" value="${esc(t.heading)}" oninput="certPreview()"></div>
      <div class="frow"><label>Introduction</label><textarea id="cd-intro" rows="2" maxlength="240" oninput="certPreview()">${esc(t.intro)}</textarea></div>
      <div class="frow"><label>Participant line</label><textarea id="cd-body" rows="2" maxlength="360" oninput="certPreview()">${esc(t.body)}</textarea></div>
      <div class="frow"><label>Score line</label><input type="text" id="cd-score" maxlength="240" value="${esc(t.scoreText)}" oninput="certPreview()"></div>
      <div class="frow"><label>Issuer</label><input type="text" id="cd-issuer" maxlength="120" value="${esc(t.issuer)}" oninput="certPreview()"></div>
      <div class="frow"><label>Issuer role</label><input type="text" id="cd-role" maxlength="120" value="${esc(t.issuerRole)}" oninput="certPreview()"></div>
      <div class="frow"><label>Text alignment</label><select id="cd-align" onchange="certPreview()"><option value="left"${t.align==='left'?' selected':''}>Left</option><option value="center"${t.align==='center'?' selected':''}>Center</option><option value="right"${t.align==='right'?' selected':''}>Right</option></select></div>
      <div class="frow"><label>Body font</label><select id="cd-font" onchange="certPreview()">${fontOptions}</select></div>
      <div class="frow"><label>Heading font</label><select id="cd-title-font" onchange="certPreview()">${titleFontOptions}</select></div>
      <div class="frow"><label>Heading size</label><input type="range" id="cd-title-size" min="16" max="44" value="${t.titleSize}" oninput="certPreview()"></div>
      <div class="frow"><label>Name size</label><input type="range" id="cd-name-size" min="24" max="64" value="${t.nameSize}" oninput="certPreview()"></div>
      <div class="frow"><label>Border style</label><select id="cd-border-style" onchange="certPreview()"><option value="double"${t.borderStyle==='double'?' selected':''}>Double</option><option value="solid"${t.borderStyle==='solid'?' selected':''}>Solid</option></select></div>
      <div class="frow certificate-colors"><label>Certificate colours</label><div><input type="color" id="cd-background" value="${t.background}" title="Background colour" oninput="certPreview()"><input type="color" id="cd-accent" value="${t.accent}" title="Text colour" oninput="certPreview()"><input type="color" id="cd-border" value="${t.border}" title="Border colour" oninput="certPreview()"></div></div>
    </div>
    <div class="certificate-preview-wrap"><span>Live preview</span><div id="cert-preview" class="certificate-preview"></div></div>
  </section>`;
}
function readCertificateDesigner(){
  const value=id=>document.getElementById(id)?.value;
  return certificateTemplate({
    emblem:value('cd-emblem'),heading:value('cd-heading'),intro:value('cd-intro'),body:value('cd-body'),scoreText:value('cd-score'),issuer:value('cd-issuer'),issuerRole:value('cd-role'),
    font:value('cd-font'),titleFont:value('cd-title-font'),align:value('cd-align'),borderStyle:value('cd-border-style'),background:value('cd-background'),accent:value('cd-accent'),border:value('cd-border'),
    titleSize:value('cd-title-size'),nameSize:value('cd-name-size')
  });
}
function certPreview(){
  const preview=document.getElementById('cert-preview');
  if(!preview)return;
  certDraft=readCertificateDesigner();
  preview.innerHTML=renderCertificateMarkup({name:'ದರ್ಶನ (ಡೀಕೆ)',title:'ಮಾದರಿ ಕ್ವಿಜ್',score:8,total:10,date:todayStr()},certDraft);
}
function toggleCertificateDesigner(){
  const designer=document.getElementById('certificate-designer'),isCertificate=document.getElementById('qf-type')?.value==='certificate';
  if(!designer)return;
  designer.hidden=!isCertificate;
  if(isCertificate)certPreview();
}
function buildQForm(){
  const q=editQId?Q:null;
  const catOpts=Object.keys(CATS).map(k=>`<option value="${k}"${q&&q.cc===k?' selected':''}>${esc(CATS[k].label)}</option>`).join('');
  return`<div class="aform"><h3>${q?'Edit Quiz':'Create New Quiz'}</h3>
    <div class="frow"><label>Quiz Title</label><input type="text" id="qf-t" placeholder="e.g. ಕನ್ನಡ ಸಾಹಿತ್ಯ ರಸಪ್ರಶ್ನೆ"></div>
    <div class="frow"><label>Description / Announcement</label><textarea id="qf-d" rows="3" placeholder="Describe the quiz, topics, rules..."></textarea></div>
    <div class="frow2">
      <div class="frow"><label>Type</label><select id="qf-type" onchange="toggleCertificateDesigner()">
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
    ${certificateDesignerMarkup()}
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
  editQId=false;qDraft=[];certDraft=defaultCertificateTemplate();
  document.getElementById('qfw').innerHTML=buildQForm();
  document.getElementById('qf-date').value=todayStr();
  renderQBuilder();toggleCertificateDesigner();document.getElementById('qfw').scrollIntoView({behavior:'smooth',block:'start'})
}
function startEditQuiz(){
  if(!Q)return;editQId=true;
  qDraft=Q.questions?JSON.parse(JSON.stringify(Q.questions)):[];certDraft=certificateTemplate(Q.certificateTemplate);
  document.getElementById('qfw').innerHTML=buildQForm();
  document.getElementById('qf-t').value=Q.title||'';
  document.getElementById('qf-d').value=Q.description||'';
  document.getElementById('qf-type').value=Q.type||'certificate';
  document.getElementById('qf-state').value=Q.state||'upcoming';
  document.getElementById('qf-date').value=Q.date||'';
  document.getElementById('qf-dl').value=Q.deadline||'';
  document.getElementById('qf-pr').value=Q.prize||'';
  renderQBuilder();toggleCertificateDesigner();document.getElementById('qfw').scrollIntoView({behavior:'smooth',block:'start'})
}
function cancelQF(){document.getElementById('qfw').innerHTML='';document.getElementById('qsubs').innerHTML='';editQId=false;qDraft=[];certDraft=null}
async function saveQForm(){
  syncQD();
  const title=document.getElementById('qf-t')?.value.trim();
  if(!title){alert('Please enter a quiz title.');return}
  if(!qDraft.length){alert('Please add at least one question.');return}
  for(let i=0;i<qDraft.length;i++){
    if(!qDraft[i].q){alert(`Question ${i+1} has no text.`);return}
    if(qDraft[i].opts.filter(o=>o).length<2){alert(`Question ${i+1} needs at least 2 options.`);return}
  }
  const type=document.getElementById('qf-type')?.value||'certificate';
  Q={
    id:editQId&&Q?Q.id:Date.now(),
    title,description:document.getElementById('qf-d')?.value.trim()||'',
    type,
    state:document.getElementById('qf-state')?.value||'upcoming',
    date:document.getElementById('qf-date')?.value.trim()||'',
    deadline:document.getElementById('qf-dl')?.value.trim()||'',
    prize:document.getElementById('qf-pr')?.value.trim()||'',
    questions:qDraft,stats:editQId&&Q?Q.stats:{total:0,qs:{}},certificateTemplate:type==='certificate'?readCertificateDesigner():null
  };
  try{await svQ();cancelQF();renderAdQuiz()}catch(e){console.error('Quiz save failed:',e);alert('The quiz could not be saved. Please try again.')}
}

(async()=>{
  // Do not render cached content; show the latest published Firebase data only.
  try{
    await window.firebaseReady;
    await loadAll();
  }catch(e){
    console.error('Firebase refresh failed:',e);
    POSTS=[...DP];COLLECTIONS=[];BOOKS=[];postsLoading=false;collectionsLoading=false;libraryLoading=false;contentLoading=false;
    openCurrentRoute();
  }
})();

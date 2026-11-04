const BLOG_NOTICE={project:'dkblog-6c5e5',list:3,site:'https://dkblog-6c5e5.web.app'};
function noticeApi_(path,method,payload){
  const key=PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');if(!key)throw Error('BREVO_API_KEY is missing');
  const response=UrlFetchApp.fetch('https://api.brevo.com/v3/'+path,{method:method||'get',headers:{'api-key':key},contentType:'application/json',payload:payload?JSON.stringify(payload):undefined,muteHttpExceptions:true});
  if(response.getResponseCode()>=300)throw Error('Brevo request failed: '+response.getResponseCode());
  return response.getContentText()?JSON.parse(response.getContentText()):{};
}
function noticeRead_(path){
  const response=UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/'+BLOG_NOTICE.project+'/databases/(default)/documents/'+path,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()>=300)throw Error('Firestore read failed: '+response.getResponseCode());return JSON.parse(response.getContentText());
}
function noticeValue_(v){if(!v)return null;if(v.mapValue)return noticeFields_(v.mapValue.fields||{});if(v.arrayValue)return(v.arrayValue.values||[]).map(noticeValue_);if(v.integerValue!==undefined)return Number(v.integerValue);return v.stringValue??v.booleanValue??v.timestampValue??null}
function noticeFields_(f){const out={};Object.keys(f).forEach(k=>out[k]=noticeValue_(f[k]));return out}
function noticeList_(name){let docs=[],token='';do{const result=noticeRead_(name+'?pageSize=1000'+(token?'&pageToken='+encodeURIComponent(token):''));docs=docs.concat((result.documents||[]).map(d=>noticeFields_(d.fields)));token=result.nextPageToken||''}while(token);return docs}
function noticeItems_(){
  const posts=noticeList_('posts'),collections=noticeList_('collections'),items=[];
  posts.forEach(p=>items.push({key:'post-'+p.id,title:p.title,url:BLOG_NOTICE.site+'/post/'+encodeURIComponent(p.id),kind:'ಹೊಸ ಬರಹ'}));
  collections.forEach(c=>items.push({key:'collection-'+c.id,title:c.title,url:BLOG_NOTICE.site+'/collection/'+encodeURIComponent(c.id),kind:'ಹೊಸ ಸಂಕಲನ'}));
  posts.filter(p=>p.collectionId).forEach(p=>items.push({key:'member-'+p.id+'-'+p.collectionId,postKey:'post-'+p.id,title:p.title,url:BLOG_NOTICE.site+'/post/'+encodeURIComponent(p.id),kind:'ಸಂಕಲನದಲ್ಲಿ ಹೊಸ ಬರಹ'}));
  const active=noticeFields_(noticeRead_('siteSettings/activeQuiz').fields||{}).quiz;
  if(active&&['upcoming','live'].includes(active.state))items.push({key:'quiz-'+active.id,title:active.title,url:BLOG_NOTICE.site+'/quiz/'+encodeURIComponent(active.id),kind:'ಹೊಸ ಕ್ವಿಜ಼್'});
  return items;
}
function checkSubscriberConnection(){
  const senders=noticeApi_('senders').senders||[],sender=senders.find(s=>s.active&&s.email==='bs.darshanbs@gmail.com');
  if(!sender)throw Error('Verified sender not found');noticeApi_('contacts/lists/'+BLOG_NOTICE.list);
  PropertiesService.getScriptProperties().setProperty('BREVO_SENDER_ID',String(sender.id));noticeItems_();console.log('Sender, list 3, and Firestore connection verified. No emails sent.');
}
function noticeEscape_(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function noticeHtml_(items){return '<html lang="kn"><body><h1>ಡೀಕೆಯ ಬರಹಗಳು</h1>'+items.map(i=>'<p>'+noticeEscape_(i.kind)+'</p><h2>'+noticeEscape_(i.title)+'</h2><p><a href="'+noticeEscape_(i.url)+'">ಓದಿ / ವಿವರ ನೋಡಿ →</a></p>').join('')+'<hr><p>ನೀವು ಡೀಕೆಯ ಬರಹಗಳಿಗೆ ಚಂದಾದಾರರಾಗಿರುವುದರಿಂದ ಈ ಇಮೇಲ್ ಬಂದಿದೆ.</p><p><a href="{{ unsubscribe }}">ಚಂದಾದಾರಿಕೆಯನ್ನು ನಿಲ್ಲಿಸಿ</a></p></body></html>'}
function createSubscriberTestDraft(){
  checkSubscriberConnection();const p=PropertiesService.getScriptProperties();
  const result=noticeApi_('emailCampaigns','post',{name:'DK Blog connection test',sender:{id:Number(p.getProperty('BREVO_SENDER_ID'))},subject:'ಡೀಕೆಯ ಬರಹಗಳು — ಪರೀಕ್ಷಾ ಸಂದೇಶ',htmlContent:noticeHtml_([{kind:'ಪರೀಕ್ಷೆ',title:'ಚಂದಾದಾರಿಕೆ ಸಂಪರ್ಕ ಪರೀಕ್ಷೆ',url:BLOG_NOTICE.site}]),recipients:{listIds:[BLOG_NOTICE.list]}});
  console.log('Test DRAFT created: '+result.id+'. Open it in Brevo and use Send a test to your own email. This function sends nothing.');
}
function installSubscriberNotifications(){
  const lock=LockService.getScriptLock();lock.waitLock(10000);try{
    checkSubscriberConnection();const p=PropertiesService.getScriptProperties();
    if(!p.getProperty('NOTICE_INSTALLED')){noticeItems_().forEach(i=>p.setProperty('seen_'+i.key,'1'));p.setProperty('NOTICE_INSTALLED',new Date().toISOString())}
    if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='pollSubscriberNotifications'))ScriptApp.newTrigger('pollSubscriberNotifications').timeBased().everyMinutes(5).create();
    console.log('Activated. Existing items excluded; checks approximately every five minutes.');
  }finally{lock.releaseLock()}
}
function pollSubscriberNotifications(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;try{
    const p=PropertiesService.getScriptProperties();if(!p.getProperty('NOTICE_INSTALLED'))throw Error('Run installer first');
    if(p.getProperty('NOTICE_PENDING'))throw Error('Campaign needs review in Brevo. No further sends until NOTICE_PENDING is resolved.');
    const fresh=noticeItems_().filter(i=>!p.getProperty('seen_'+i.key));if(!fresh.length)return;
    const keys=new Set(fresh.map(i=>i.key)),items=fresh.filter(i=>!i.postKey||!keys.has(i.postKey));
    p.setProperty('NOTICE_PENDING',JSON.stringify({keys:fresh.map(i=>i.key),phase:'creating'}));
    const draft=noticeApi_('emailCampaigns','post',{name:'DK Blog '+new Date().toISOString(),sender:{id:Number(p.getProperty('BREVO_SENDER_ID'))},subject:items.length===1?items[0].kind+': '+items[0].title:'ಡೀಕೆಯ ಬರಹಗಳು — ಹೊಸ ಪ್ರಕಟಣೆಗಳು',htmlContent:noticeHtml_(items),recipients:{listIds:[BLOG_NOTICE.list]}});
    p.setProperty('NOTICE_PENDING',JSON.stringify({keys:fresh.map(i=>i.key),campaignId:draft.id,phase:'sending'}));
    noticeApi_('emailCampaigns/'+draft.id+'/sendNow','post');
    fresh.forEach(i=>p.setProperty('seen_'+i.key,'1'));p.deleteProperty('NOTICE_PENDING');
  }finally{lock.releaseLock()}
}

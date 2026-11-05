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
function noticeHtml_(items){
  const escape=noticeEscape_;
  const heading=items.length===1?'ನಿಮಗಾಗಿ ಹೊಸ ಪ್ರಕಟಣೆ!':'ನಿಮಗಾಗಿ ಹೊಸ ಪ್ರಕಟಣೆಗಳು!';
  const preview=escape(items.map(item=>item.title).join(' · ').slice(0,200));
  const entries=items.map(item=>{
    const action=item.kind==='ಹೊಸ ಕ್ವಿಜ಼್'?'ಕ್ವಿಜ಼್ ವಿವರ ನೋಡಿ →':item.kind==='ಹೊಸ ಸಂಕಲನ'?'ಸಂಕಲನ ನೋಡಿ →':'ಬರಹ ಓದಿ →';
    return `<tr><td style="padding:24px 28px;border-top:1px solid #e8d5b0;">
      <p style="margin:0 0 10px;color:#7a3b1e;font-size:14px;line-height:1.8;">${escape(item.kind)}</p>
      <h2 style="margin:0 0 20px;color:#2c1a0e;font-size:23px;line-height:1.7;overflow-wrap:anywhere;">${escape(item.title)}</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#7a3b1e" style="border-radius:24px;"><a href="${escape(item.url)}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:17px;line-height:1.7;font-weight:700;">${action}</a></td></tr></table>
    </td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="kn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"><title>${heading}</title><link href="https://fonts.googleapis.com/css2?family=Anek+Kannada:wght@400;500;700&display=swap" rel="stylesheet"></head>
  <body style="margin:0;padding:0;background-color:#f7f2e7;font-family:'Anek Kannada','Noto Sans Kannada',Arial,sans-serif;color:#2c1a0e;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f2e7;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="570" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:570px;background-color:#fffdf5;border:1px solid #e8d5b0;">
  <tr><td align="center" style="padding:30px 24px;background-color:#3d1f0a;"><a href="${BLOG_NOTICE.site}/" style="color:#e8d5b0;text-decoration:none;font-size:28px;line-height:1.6;font-weight:700;">ಡೀಕೆಯ ಬರಹಗಳು</a><p style="margin:8px 0 0;color:#e8d5b0;font-size:15px;line-height:1.8;">ಬರಹಗಳ ಜಗತ್ತು</p></td></tr>
  <tr><td style="padding:30px 28px;"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.7;color:#7a3b1e;">${heading}</h1><p style="margin:0;font-size:17px;line-height:1.9;color:#5a3e2b;">ಆತ್ಮೀಯ ಓದುಗರೇ,<br>ಡೀಕೆಯ ಬರಹಗಳ ಲೋಕದಲ್ಲಿ ಹೊಸ ಪ್ರಕಟಣೆ ಬಂದಿದೆ. ಕೆಳಗಿನ ಕೊಂಡಿಯ ಮೂಲಕ ಓದಿ, ನಿಮ್ಮ ಅನಿಸಿಕೆಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ.</p></td></tr>
  ${entries}
  <tr><td style="padding:12px 28px 30px;"><p style="margin:0;padding:18px 0;border-top:1px solid #e8d5b0;border-bottom:1px solid #e8d5b0;text-align:center;font-size:17px;line-height:1.9;color:#7a3b1e;">ಕೆಲವು ಭಾವಗಳನ್ನು ಕನ್ನಡದಲ್ಲಿ ಮಾತ್ರ ಹೇಳಬಹುದು.</p><p style="margin:24px 0 0;font-size:16px;line-height:1.9;">ಪ್ರೀತಿಯಿಂದ,<br><strong>ದರ್ಶನ (ಡೀಕೆ)</strong></p></td></tr>
  <tr><td align="center" style="padding:22px 24px;background-color:#ede5d0;color:#5a3e2b;font-size:13px;line-height:1.9;"><p style="margin:0 0 12px;">ನೀವು ಡೀಕೆಯ ಬರಹಗಳಿಗೆ ಚಂದಾದಾರರಾಗಿರುವುದರಿಂದ ಈ ಇಮೇಲ್ ಬಂದಿದೆ.</p><p style="margin:0;"><a href="{{ unsubscribe }}" style="color:#7a3b1e;text-decoration:underline;">ಚಂದಾದಾರಿಕೆಯನ್ನು ನಿಲ್ಲಿಸಿ</a></p></td></tr>
  </table></td></tr></table></body></html>`;
}
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

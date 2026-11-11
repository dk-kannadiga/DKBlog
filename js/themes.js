(()=>{
  const themes={
    brown:{label:'ಮೂಲ ಕಂದು',font:'Anek Kannada',colors:['#f7f2e7','#ede5d0','#2c1a0e','#5a3e2b','#7a3b1e','#c8a87a','#e8d5b0','#fffdf5'],header:'#3d1f0a'},
    sandalwood:{label:'ಶ್ರೀಗಂಧ · Sandalwood',font:'Anek Kannada',colors:['#fcf6eb','#f0e5d4','#382314','#705641','#985022','#aa7441','#dfcfb9','#fffaf2'],header:'#49301d'},
    forest:{label:'ಹಸಿರು ಗ್ರಂಥಾಲಯ · Forest Library',font:'Noto Serif Kannada',colors:['#f3f5ed','#e4ebdc','#18382e','#53685b','#2b684e','#73937b','#cdd8c8','#fcfdf8'],header:'#18382e'},
    indigo:{label:'ನೀಲಿ ದಿನಚರಿ · Indigo Journal',font:'Noto Sans Kannada',colors:['#f5f6fc','#e8ebf7','#222d50','#58627c','#4358b1','#7888bc','#d8ddef','#ffffff'],header:'#222d50'},
    crimson:{label:'ಕೆಂಪು ಪರಂಪರೆ · Crimson Heritage',font:'Baloo Tamma 2',colors:['#fff6ec','#f5e5df','#42262c','#79565a','#982f43','#bb7d79','#e7cace','#fffaf3'],header:'#602332'},
    midnight:{label:'ನಡುರಾತ್ರಿ ಮಸಿ · Midnight Ink',font:'Anek Kannada',colors:['#171e2c','#2c374a','#f1eee5','#b6c0ce','#e7ba75','#c7ac85','#3d485b','#222c3d'],header:'#111827'}
  };
  let selected='brown';try{const saved=localStorage.getItem('dk-theme');if(saved==='system'||themes[saved])selected=saved}catch{}
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  function apply(choice){
    selected=choice;const key=choice==='system'?(media.matches?'midnight':'sandalwood'):choice,t=themes[key]||themes.brown;
    const root=document.documentElement;root.dataset.theme=key;
    ['p','pd','ink','il','ac','gd','gl','cb'].forEach((name,i)=>root.style.setProperty('--'+name,t.colors[i]));
    root.style.setProperty('--theme-font',`"${t.font}",sans-serif`);root.style.setProperty('--theme-header',t.header);
    root.style.colorScheme=key==='midnight'?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t.header);
    if(key!=='brown'&&!document.getElementById('theme-extra-fonts')){const link=document.createElement('link');link.id='theme-extra-fonts';link.rel='stylesheet';link.href='https://fonts.googleapis.com/css2?family=Noto+Serif+Kannada:wght@400;500;700&family=Baloo+Tamma+2:wght@400;500;700&display=swap';document.head.appendChild(link)}
  }
  apply(selected);
  media.addEventListener('change',()=>{if(selected==='system')apply('system')});
  document.addEventListener('DOMContentLoaded',()=>{
    const picker=document.getElementById('visitor-theme');if(!picker)return;
    for(const [value,t]of Object.entries(themes)){const option=document.createElement('option');option.value=value;option.textContent=t.label;picker.appendChild(option)}
    const option=document.createElement('option');option.value='system';option.textContent='ಸಾಧನದಂತೆ · Follow device';picker.appendChild(option);picker.value=selected;
    picker.addEventListener('change',()=>{apply(picker.value);try{localStorage.setItem('dk-theme',selected)}catch{}});
    window.addEventListener('storage',event=>{if(event.key==='dk-theme'){const value=event.newValue;apply(value==='system'||themes[value]?value:'brown');picker.value=selected}});
  });
})();

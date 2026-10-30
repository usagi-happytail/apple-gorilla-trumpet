'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const keys = ['apple','gorilla','trumpet'];
  const meta = {apple:['りんご','🍎'],gorilla:['ゴリラ','🦍'],trumpet:['ラッパ','🎺']};
  const storage = 'little-vision-v1-examples';
  let model, file = null, previewUrl = null, busy = false;
  let examples = {apple:[],gorilla:[],trumpet:[]};
  function notice(s) { $('toast').textContent=s; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),3500); }
  function status(s, kind='') { $('statusText').textContent=s; $('status').className='status '+kind; }
  function updateButtons(){ $('analyze').disabled = busy||!model||!file; $('addTraining').disabled=busy||!model; $('reset').disabled=busy; }
  function counts(){ $('counts').innerHTML=keys.map(k=>'<div class="count">'+meta[k][1]+' '+meta[k][0]+' <b>'+examples[k].length+'枚</b></div>').join('');}
  function valid(d){
    if(!d||typeof d!=='object') throw Error('JSON形式が正しくありません');
    const out={};let dim=0;
    for(const k of keys){
      if(!Array.isArray(d[k])||d[k].length>40) throw Error('登録数または形式が不正です');
      out[k]=d[k].map(v=>{
        if(!Array.isArray(v)||!v.length||v.length>4096||v.some(x=>typeof x!=='number'||!Number.isFinite(x))) throw Error('特徴量が不正です');
        if(dim&&dim!==v.length) throw Error('特徴量の次元が一致しません');dim=v.length;return v;
      });
    }
    return out;
  }
  try{examples=valid(JSON.parse(localStorage.getItem(storage))||examples);}catch(e){console.warn(e);}
  counts();
  function save(){try{localStorage.setItem(storage,JSON.stringify(examples));}catch(e){notice('自動保存できません。JSONをダウンロードしてください');}counts();}
  function exampleMode(){return keys.every(k=>examples[k].length>=2);}
  function setFile(f){
    if(!f)return;
    if(!f.type.startsWith('image/')){notice('画像ファイルを選択してください');return;}
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    file=f;previewUrl=URL.createObjectURL(f);
    $('preview').src=previewUrl;$('preview').style.display='block';
    $('dropTitle').textContent=f.name;$('dropNote').textContent='クリックして写真を変更';
    $('resultName').textContent='判定待ち';$('resultEmoji').textContent='🔎';
    $('resultText').textContent='「AIで判定する」を押してください';
    $('scores').hidden=true;$('scoreNote').hidden=true;
    updateButtons();
  }
  $('file').addEventListener('change',e=>setFile(e.target.files[0]));
  $('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('dragging');});
  $('drop').addEventListener('dragleave',()=>$('drop').classList.remove('dragging'));
  $('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('dragging');setFile(e.dataTransfer.files[0]);});
  $('drop').addEventListener('keydown',e=>{if(e.target===$('drop')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('file').click();}});
  $('reset').onclick=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;file=null;$('file').value='';$('preview').removeAttribute('src');$('preview').style.display='none';$('dropTitle').textContent='クリックして写真を選ぶ';$('dropNote').textContent='またはここに画像をドロップ';$('resultName').textContent='画像を選んでください';$('resultEmoji').textContent='🔎';$('resultMode').textContent='判定待ち';$('resultText').textContent='写真を選び、「AIで判定する」を押してください。';$('scores').hidden=true;$('scoreNote').hidden=true;updateButtons();};
  async function imageFor(f){
    const url=URL.createObjectURL(f),img=new Image();img.src=url;
    try{await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }
  function embed(img){
    const t=model.infer(img,true);
    try{const a=Array.from(t.dataSync());const norm=Math.hypot(...a)||1;return a.map(v=>v/norm);}
    finally{t.dispose();}
  }
  function similarity(a,b){if(a.length!==b.length)return -1;let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;}
  function scoreClass(preds){
    const s={apple:0,gorilla:0,trumpet:0};
    for(const p of preds){
      const n=p.className.toLowerCase();
      if(/granny smith|apple|red delicious|golden delicious/.test(n))s.apple+=p.probability;
      if(/gorilla/.test(n))s.gorilla+=p.probability;
      if(/cornet|trumpet/.test(n))s.trumpet+=p.probability;
    }
    return s;
  }
  function scoreExamples(embedding){
    const score={};
    for(const k of keys){
      const nearest=examples[k].map(v=>similarity(embedding,v)).sort((a,b)=>b-a).slice(0,3);
      score[k]=nearest.reduce((a,b)=>a+b,0)/nearest.length;
    }
    return score;
  }
  function results(s,mode){
    const ordered=keys.map(k=>[k,s[k]]).sort((a,b)=>b[1]-a[1]);
    const [winner,best]=ordered[0];
    const uncertain=mode==='generic' ? best<0.12 : best<0.35;
    $('resultEmoji').textContent=uncertain?'❔':meta[winner][1];
    $('resultName').textContent=uncertain?'判定できませんでした':meta[winner][0];
    $('resultMode').textContent=mode==='examples'?'お手本との類似度による判定':'学習済みモデルによる判定';
    $('resultText').textContent=uncertain?'自信を持って判定できません。別の写真や見本登録を試してください。':'判定候補：'+meta[winner][0];
    $('scores').hidden=false;
    $('scores').innerHTML=ordered.map(([k,v])=>'<div class="score-row"><span>'+meta[k][1]+' '+meta[k][0]+'</span><strong>'+Math.round(100*Math.max(0,v))+'%</strong><div class="score-track"><div class="score-fill" style="width:'+Math.max(0,Math.min(100,v*100))+'%"></div></div></div>').join('');
    $('scoreNote').hidden=false;
    $('scoreNote').textContent=mode==='examples'?'表示値は特徴の類似度であり、正解確率ではありません。':'表示値はMobileNetの元ラベルのスコアです。3択の正解確率ではありません。';
    $('modeNotice').textContent=mode==='examples'?'各種類に登録した見本と画像の特徴を比較しています。':'判定が不安定な場合は、各種類2枚以上のお手本を登録してください。';
  }
  $('analyze').onclick=async()=>{
    if(!file||!model)return;
    busy=true;updateButtons();status('判定しています…');
    try{
      const img=await imageFor(file);
      if(exampleMode())results(scoreExamples(embed(img)),'examples');
      else results(scoreClass(await model.classify(img,1000)),'generic');
      status('AIの準備完了','ready');
    }catch(e){console.error(e);status('判定に失敗しました','error');notice('画像の判定に失敗しました');}
    finally{busy=false;updateButtons();}
  };
  $('addTraining').onclick=()=>$('trainFile').click();
  $('trainFile').onchange=async e=>{
    const files=Array.from(e.target.files);e.target.value='';if(!model||!files.length)return;
    const k=$('trainLabel').value;busy=true;updateButtons();status('お手本を登録しています…');
    let added=0;
    try{for(const f of files){if(examples[k].length>=40)break;if(!f.type.startsWith('image/'))continue;const img=await imageFor(f);examples[k].push(embed(img));added++;}save();notice(meta[k][0]+'の見本を'+added+'枚登録しました');status('AIの準備完了','ready');}
    catch(e){console.error(e);save();status('一部登録に失敗しました','error');notice('一部の画像を登録できませんでした');}
    finally{busy=false;updateButtons();}
  };
  $('exportSamples').onclick=()=>{
    const b=new Blob([JSON.stringify(examples)],{type:'application/json'});
    const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='little-vision-examples.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  };
  $('importSamples').onclick=()=>$('importFile').click();
  $('importFile').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{examples=valid(JSON.parse(await f.text()));save();notice('登録データを読み込みました');}catch(err){notice('読み込み失敗: '+err.message);}
  };
  $('clearSamples').onclick=()=>{if(!confirm('登録したお手本を全件削除しますか？'))return;examples={apple:[],gorilla:[],trumpet:[]};save();notice('登録データを削除しました');};
  (async()=>{
    try{
      if(!window.tf||!window.mobilenet)throw Error('AIのライブラリを読み込めませんでした');
      status('AIモデルを読み込んでいます…');
      model=await mobilenet.load({version:2,alpha:1});
      status('AIの準備完了','ready');updateButtons();
    }catch(e){console.error(e);status('AIモデルの読み込みに失敗しました','error');notice('ネット接続を確認してページを再読み込みしてください');}
  })();
})();
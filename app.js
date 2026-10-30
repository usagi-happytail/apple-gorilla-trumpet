'use strict';

// CLIP zero-shot classifier: no custom training images are needed.
const $ = (id) => document.getElementById(id);
const categories = [
  { key: 'apple', label: 'りんご', emoji: '🍎', prompts: [
    'a photograph of an apple fruit',
    'a red or green apple',
    'a close-up photo of an apple'
  ] },
  { key: 'gorilla', label: 'ゴリラ', emoji: '🦍', prompts: [
    'a photograph of a gorilla',
    'a large gorilla ape',
    'a close-up photo of a gorilla'
  ] },
  { key: 'trumpet', label: 'ラッパ', emoji: '🎺', prompts: [
    'a photograph of a brass trumpet musical instrument',
    'someone playing a trumpet',
    'a shiny golden trumpet'
  ] }
];

let classifier = null;
let loadingPromise = null;
let selectedFile = null;
let previewUrl = null;
let isBusy = false;

function setStatus(message, type = '') {
  $('statusText').textContent = message;
  $('status').className = 'status ' + type;
}

function setNotice(message, warning = false) {
  $('modeNotice').textContent = message;
  $('modeNotice').className = 'notice' + (warning ? ' warning' : '');
}

function updateButtons() {
  $('analyze').disabled = isBusy || !selectedFile;
  $('reset').disabled = isBusy || !selectedFile;
  $('file').disabled = isBusy;
}

function chooseFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setNotice('JPEG、PNG、WebPなどの画像ファイルを選択してください。', true);
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  $('preview').src = previewUrl;
  $('drop').classList.add('has-image');
  $('dropTitle').textContent = file.name;
  $('dropNote').textContent = 'クリックすると写真を変更できます';
  $('resultMode').textContent = '判定待ち';
  $('resultName').textContent = '判定待ち';
  $('resultEmoji').textContent = '🔎';
  $('resultText').textContent = '「AIで判定する」を押してください。';
  $('scores').hidden = true;
  $('scoreNote').hidden = true;
  setNotice('見本画像は不要です。初回の判定ではAIモデルのダウンロードが必要です。');
  updateButtons();
}

$('drop').addEventListener('click', (event) => {
  if (!isBusy && event.target !== $('file')) $('file').click();
});
$('drop').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !isBusy) {
    event.preventDefault();
    $('file').click();
  }
});
$('file').addEventListener('change', (event) => {
  chooseFile(event.target.files[0]);
});
$('drop').addEventListener('dragover', (event) => {
  event.preventDefault();
  $('drop').classList.add('dragging');
});
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
$('drop').addEventListener('drop', (event) => {
  event.preventDefault();
  $('drop').classList.remove('dragging');
  if (!isBusy) chooseFile(event.dataTransfer.files[0]);
});

$('reset').addEventListener('click', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  selectedFile = null;
  $('file').value = '';
  $('preview').removeAttribute('src');
  $('drop').classList.remove('has-image');
  $('dropTitle').textContent = 'クリックして写真を選ぶ';
  $('dropNote').textContent = 'またはここに画像をドロップ';
  $('resultMode').textContent = '判定待ち';
  $('resultEmoji').textContent = '🔎';
  $('resultName').textContent = '画像を選んでください';
  $('resultText').textContent = '写真を選び、「AIで判定する」を押してください。';
  $('scores').hidden = true;
  $('scoreNote').hidden = true;
  setNotice('見本画像の登録は不要です。');
  updateButtons();
});

async function getClassifier() {
  if (classifier) return classifier;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    setStatus('高精度AIを準備しています…');
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
    env.allowLocalModels = false;
    const model = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
      progress_callback: (event) => {
        if (event.status === 'progress' && Number.isFinite(event.progress)) {
          setStatus('AIをダウンロード中: ' + Math.round(event.progress) + '%');
        } else if (event.status === 'initiate' || event.status === 'download') {
          setStatus('AIモデルをダウンロード中…');
        } else if (event.status === 'done') {
          setStatus('AIモデルを準備しています…');
        }
      }
    });
    classifier = model;
    setStatus('AIの準備完了', 'ready');
    return model;
  })().catch((error) => {
    loadingPromise = null;
    throw error;
  });
  return loadingPromise;
}

function displayResults(output) {
  const scores = new Map(categories.map((category) => [category.key, 0]));
  const byPrompt = new Map();
  for (const category of categories) {
    for (const prompt of category.prompts) byPrompt.set(prompt, category.key);
  }
  for (const item of output) {
    const key = byPrompt.get(item.label);
    if (key && Number.isFinite(item.score)) scores.set(key, scores.get(key) + item.score);
  }
  const ordered = categories.map((category) => ({
    ...category,
    score: scores.get(category.key)
  })).sort((a, b) => b.score - a.score);
  const total = ordered.reduce((sum, x) => sum + x.score, 0);
  if (!(total > 0)) throw new Error('AIの出力から判定スコアを取得できませんでした');
  for (const result of ordered) result.score /= total;

  const best = ordered[0];
  const gap = best.score - ordered[1].score;
  $('resultMode').textContent = 'CLIPによる3種類の画像比較';
  $('resultEmoji').textContent = best.emoji;
  $('resultName').textContent = best.label;
  $('resultText').textContent = gap < 0.10
    ? '1位と2位の差が小さいため、判定があいまいです。'
    : '最も近い候補は「' + best.label + '」です。';

  const container = $('scores');
  container.replaceChildren();
  for (const item of ordered) {
    const wrapper = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'score-title';
    const name = document.createElement('span');
    name.textContent = item.emoji + ' ' + item.label;
    const value = document.createElement('span');
    value.textContent = (item.score * 100).toFixed(1) + '%';
    title.append(name, value);
    const track = document.createElement('div');
    track.className = 'track';
    const fill = document.createElement('div');
    fill.style.width = Math.max(0, Math.min(100, item.score * 100)) + '%';
    track.append(fill);
    wrapper.append(title, track);
    container.append(wrapper);
  }
  container.hidden = false;
  $('scoreNote').textContent =
    'スコアは3種類の候補間の相対的な一致度であり、正解する確率ではありません。候補以外の写真でも、いずれかを表示します。';
  $('scoreNote').hidden = false;
  setNotice(gap < 0.10
    ? '判定が接戦です。別角度の写真でも比較してみてください。'
    : '見本登録なしで、画像と各候補の説明文を直接比較しました。');
}

$('analyze').addEventListener('click', async () => {
  if (isBusy || !selectedFile) return;
  isBusy = true;
  updateButtons();
  let objectUrl = null;
  try {
    const model = await getClassifier();
    setStatus('画像を判定しています…');
    objectUrl = URL.createObjectURL(selectedFile);
    const prompts = categories.flatMap((category) => category.prompts);
    const output = await model(objectUrl, prompts);
    displayResults(output);
    setStatus('AIの準備完了', 'ready');
  } catch (error) {
    console.error('画像判定エラー:', error);
    setStatus('AIを読み込めませんでした', 'error');
    setNotice('AIの読み込み・判定に失敗しました。ネット接続、端末の空きメモリを確認し、再度お試しください。', true);
    $('resultMode').textContent = 'エラー';
    $('resultText').textContent = '判定できませんでした。再度「AIで判定する」を押してください。';
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    isBusy = false;
    updateButtons();
  }
});

setStatus('写真を選んでください');
updateButtons();
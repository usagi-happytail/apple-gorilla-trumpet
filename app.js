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

// Broad examples outside the target set. These help reject unrelated photos.
// This is a heuristic, not a calibrated open-set recognition model.
const backgroundCategories = [
  { key: 'dog', prompts: ['a photograph of a dog', 'a photo of a pet dog'] },
  { key: 'cat', prompts: ['a photograph of a cat', 'a domestic cat sitting'] },
  { key: 'person', prompts: ['a portrait photograph of a person', 'people standing together in a photograph'] },
  { key: 'car', prompts: ['a photograph of a car', 'a vehicle parked on a street'] },
  { key: 'building', label: '建物', prompts: ['a photograph of a large building', 'a house on a street'] },
  { key: 'castle', label: '城・城郭', prompts: [
    'a photograph of a Japanese castle with white walls and tiled roofs',
    'a photograph of a medieval stone castle with towers',
    'a photograph of an old castle or fortress'
  ] },
  { key: 'temple', label: '寺院・神社', prompts: [
    'a photograph of a Japanese shrine or temple',
    'a photograph of a traditional Buddhist temple'
  ] },
  { key: 'monument', label: '建造物・名所', prompts: [
    'a photograph of a famous historic landmark',
    'a photograph of an ancient stone monument'
  ] },
  { key: 'landscape', prompts: ['a landscape photograph of mountains', 'a photograph of a beach and the sea'] },
  { key: 'bird', prompts: ['a photograph of a bird', 'a small bird perched on a branch'] },
  { key: 'flower', prompts: ['a close-up photograph of a flower', 'a bouquet of colorful flowers'] },
  { key: 'food', prompts: ['a photograph of a sandwich', 'a plate of cooked food'] },
  { key: 'chair', prompts: ['a photograph of a chair', 'a wooden chair in a room'] },
  { key: 'phone', prompts: ['a photograph of a smartphone', 'a mobile phone on a table'] },
  { key: 'bicycle', prompts: ['a photograph of a bicycle', 'a person riding a bicycle'] }
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
  // Average the prompt scores per category to avoid favoring categories
  // merely because they have more text examples.
  const options = [...categories, ...backgroundCategories];
  const byPrompt = new Map();
  for (const category of options) {
    for (const prompt of category.prompts) byPrompt.set(prompt, category.key);
  }
  const totals = new Map(options.map((category) => [category.key, 0]));
  for (const item of output) {
    const key = byPrompt.get(item.label);
    if (key && Number.isFinite(item.score)) {
      totals.set(key, totals.get(key) + item.score);
    }
  }
  const mean = (category) => totals.get(category.key) / category.prompts.length;
  const rankedTargets = categories.map((category) => ({
    ...category,
    raw: mean(category),
  })).sort((a, b) => b.raw - a.raw);
  const bestRaw = rankedTargets[0].raw;
  const totalTarget = rankedTargets.reduce((sum, x) => sum + x.raw, 0);
  if (!(totalTarget > 0)) throw new Error('AIの判定スコアを取得できませんでした');

  // These are conditional three-way scores, NOT the probability that
  // the image belongs to one of the three known categories.
  for (const target of rankedTargets) target.score = target.raw / totalTarget;
  const best = rankedTargets[0];
  const gap = best.score - rankedTargets[1].score;
  // The reported 3-way score is conditional on the target labels; even a
  // castle can have a high "gorilla" percentage. Compare against unrelated
  // labels BEFORE deciding whether the best target is acceptable.
  const strongestBackground = backgroundCategories
    .map((category) => ({ ...category, raw: mean(category) }))
    .sort((a, b) => b.raw - a.raw)[0];
  const relativeBackground = strongestBackground.raw / Math.max(bestRaw, Number.EPSILON);

  // Provisional rejection heuristics: evaluate with real photos before
  // treating these as reliable open-set thresholds.
  const isUnrelated = relativeBackground >= 1.08 ||
    (best.score < 0.50 && relativeBackground >= 0.85);
  const isAmbiguous = !isUnrelated && gap < 0.08;

  $('resultMode').textContent = 'CLIPによる画像判定';
  if (isUnrelated) {
    $('resultEmoji').textContent = '🚫';
    $('resultName').textContent = '関係ない可能性が高い';
    $('resultText').textContent =
      'りんご・ゴリラ・ラッパ以外の特徴が強いと推定しました。' +
      (strongestBackground.label ? ' 参考候補：' + strongestBackground.label + '。' : '');
  } else if (isAmbiguous) {
    $('resultEmoji').textContent = '❔';
    $('resultName').textContent = '判定があいまい';
    $('resultText').textContent =
      '上位2候補のスコア差が小さいため、断定できません。';
  } else {
    $('resultEmoji').textContent = best.emoji;
    $('resultName').textContent = best.label;
    $('resultText').textContent = '最も近い候補は「' + best.label + '」です。';
  }

  const container = $('scores');
  container.replaceChildren();
  for (const item of rankedTargets) {
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
  }
  container.hidden = false;
  $('scoreNote').textContent =
    'この％は「りんご・ゴリラ・ラッパ」の3候補内だけでの割合です。正解確率ではありません。対象外判定は他の画像候補との比較による暫定的な推定です。';
  $('scoreNote').hidden = false;
  setNotice(isUnrelated
    ? '対象外の例との比較・スコア基準から、3種類以外と推定しました。判定は確定ではありません。'
    : isAmbiguous
      ? '上位2候補が接戦です。別の写真でも試してみてください。'
      : '見本登録なしで、画像と各候補の説明文を比較しました。');
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
    const prompts = [...categories, ...backgroundCategories].flatMap((category) => category.prompts);
    const output = await model(objectUrl, prompts, { hypothesis_template: '{}' });
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
# りんご・ゴリラ・ラッパ AI画像判定

画像を選んで「りんご・ゴリラ・ラッパ」に分類する、サーバー不要の簡単なブラウザアプリです。

## 使い方

1. `index.html` をChromeやSafariなどのブラウザで開きます（初回はインターネット接続が必要）。
2. AIモデルの読み込み完了後、写真を選んで「AIで判定する」を押します。
3. よりよい判定を試したいときは、各カテゴリーの見本画像を2枚以上ずつ追加します。
4. お手本の特徴量はブラウザの `localStorage` に保存されます。JSONでバックアップや移行ができます。

## GitHub Pagesで無料公開

1. GitHubで**公開（Public）**リポジトリを新規作成します。例: `little-vision-lab`。
2. このフォルダの `index.html` と `app.js` をリポジトリ直下にアップロードします。
3. リポジトリの **Settings → Pages** で **Deploy from a branch** を選択。
4. **Branch: main / (root)** を選択して保存します。
5. 公開後、`https://＜GitHubユーザー名＞.github.io/little-vision-lab/` からアクセスできます。

※GitHub Pagesは無料プランの公開リポジトリで利用できます。ドメインを別途購入する必要はありません。公開されるのはコードだけで、判定に使った写真はアップロードされません。

## 仕組み・注意点

- [TensorFlow.js](https://www.tensorflow.org/js) および [MobileNet](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet) の事前学習済みモデルをブラウザ内で実行します。
- 初期モード: ImageNetの約1,000ラベルのうち、対応するクラス（`Granny Smith` / `gorilla` / `cornet` など）を集計します。そのため赤いりんご等は判定を保留する場合があります。表示スコアは3分類に限定して正規化した確率ではありません。
- お手本モード: 画像の埋め込み特徴量を使い、近い見本を重み付き多数決します。**AIモデルの重みを再学習するわけではありません**。表示する相対スコアは統計的に校正された確率ではありません。
- どの程度の精度になるかは実画像で測っていません。業務用途に使う前に現場別のテストが必要です。
- 外部から取得するのはJavaScriptと学習済みモデルです。判定対象の画像は外部サーバーへ送信しません。
- 外部CDNを用いるため完全オフライン運用には対応していません。
- リポジトリが公開でも、登録した写真や見本の特徴量はリポジトリに自動アップロードされません。JSONバックアップを公開リポジトリに置かないようご注意ください。

© Sample project. TensorFlow.js / MobileNet packages are Apache-2.0 licensed.
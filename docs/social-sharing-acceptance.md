# SNS 共有と表示の確認

## 固定画像
- `assets/social-preview.png` は 1200 × 630 の固定紹介画像。実ゲームの `COLORS`、【意味】問題と8選択肢を使う。実プレイ結果やランキング画面ではない。
- `scripts/render-social-preview.js` で編集可能な SVG を再生成する。PNG は同 SVG をシステム librsvg/cairo で描画したもの。AI生成、外部素材、プレイヤー名、架空スコアは使用しない。
- Open Graph と Twitter の画像 URL は既存 GitHub Pages 正式 URL 配下。ソース画像と PNG を同じ PR に保持し、ビルドが画像をコピーする。SNS 側のキャッシュ更新や実カード表示はマージ・配信後の確認が必要。

## 共有文
15 言語のホーム・結果に `#イロアテ #ゲーム制作` を1回ずつ追加。名前は共有しない。URL は最後の行。長い結果数値でも URL を23文字換算した保守的280文字検査を行う。

## 表示受入と制限
既存デスクトップ確認を維持し、15言語 × 縦横 × ホーム/結果 × Chromium/WebKit のモバイル相当検査を追加。可視性・祖先の透明度・44px・中心ヒット・tap時intentを確認する。画像はCI artifactへ保存。
通信は localhost 以外 mock/deny、Service WorkerとWebSocketも遮断。X投稿は行わない。非表示/祖先透明の対照が失敗することを確認する。
本人のiPhone Safari実機におけるボタン消失原因は未確定。ブラウザ模擬確認を実機の解決済みとしない。

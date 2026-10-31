# イロアテ / Iroate

文字の意味と文字の表示色を見分ける20問のブラウザゲームです。

正式URL（移行先）: https://chameleonjp-lab.github.io/iroate/

15言語: ja, en, es, pt-BR, zh-Hans, fr, de, ko, ru, it, zh-Hant, id, tr, vi, th。
言語選択はサイノメと同じ順序・ロケール判定。端末設定から初期選択し、手動選択を優先して保存します。カウントダウンとプレイ中は言語を固定します。翻訳の追加は `js/locales/` と `js/language-options.js` を変更してください。色IDやhexは翻訳しません。

SEは初期OFF。上部ボタンでONにするとユーザー操作でWeb Audioを有効にします。設定を保存し、OFF・非表示で音を停止します。選択、戻る、3/2/1、開始、正解、不正解、クリア、結果、自己ベスト、リタイアの短い合成音です。BGM・外部音源はありません。

## ローカル開発とテスト

Node.js 24、npmを使用します。

```sh
npm ci
npm run check:syntax
npm test
npm run build:pages
npm run verify:pages
npx playwright install --with-deps chromium webkit
npm run test:browser
node scripts/serve.js
```

`http://127.0.0.1:4173/iroate/` でビルドした配備物を開きます。`dist/` 以外を公開しないでください。Supabase SDKはlockfileで固定し、ビルド時にライセンスと共に同梱するため実行時CDN依存はありません。
ブラウザ試験は外部通信を遮断し、ランキング応答をスタブ化します。本番への試験スコアは送信しません。WebKitはLinux上の自動試験であり、iPhone Safari実機確認とは異なります。

## 維持するゲーム・ランキング契約

- 全20問、意味10問・色10問、誤答+5秒、正解まで同問。
- 元の候補抽出・回答バランス・同種最大3連続の生成処理を維持。
- 保存スコア: `Math.round((elapsedSeconds + penaltySeconds) * 100)`。短いほど良い。
- Supabaseプロジェクト `mlpnjgezrnhdxsxolyzj`、`game_slug=iroate`、`client_version=iroate-ranking-v1`。
- `score_order=asc`、`score_unit=秒`、`score_scale=100`、`score_decimals=2`、`submission_mode=shared`。
- クリア時に既存 `submit_score(p_display_name,p_game_slug,p_score,p_client_version)` を1回呼ぶ。開始RPCなし、リタイアは送らない。初回/ベストは既存 `get_first_try_ranking` / `get_best_score_ranking`、各10件、サーバー順位を表示。
- `public.game_scores` が集計、`public.score_runs` が履歴。今回、保存方式・データ・RPCを変更しない。
- 非冪等の既存RPCを維持するため、自動再送もランキング再送ボタンも追加しない。通信失敗・時間切れでも結果と再戦は利用可能。実験場の新ランキング契約への移行は今回の対象外（ユーザー指定優先）。

`iroAteBestTime` は従来の秒単位JSON（finalTime, clearTime, missCount, updatedAt）、`iroAtePlayerName` は名前です。同じorigin内では既存値を使います。CodebergとGitHubのlocalStorageは共有されないため、端末内の名前・自己ベストは自動移行しません。Supabase上のランキング記録は同じプロジェクト/slugに継続保存され、これとは別です。

## 公開順序とマージ前の必須設定

1. **管理者がPR①マージ前に** [Settings → Pages](https://github.com/chameleonjp-lab/iroate/settings/pages) → Build and deployment → Source を **GitHub Actions** にする。現在はlegacy/mainルート公開。設定APIは403で変更できなかった。ソース直配信のままマージしない（生成するvendorを含まず、テストも迂回するため）。
2. PR①の「Tests and static build」を確認してユーザーがmainへマージ。main直接push・自動マージは行わない。必要ならブランチ保護でこのチェックを必須にする。保護詳細の読取も403、mainはprotected=false、rulesetsなし。
3. Actionsの「Deploy tested main」成功後、マージコミットの完全SHAで `node scripts/verify-deployed.js <SHA>`。`version.json` とHTMLの `chameleonjp-release` を照合し、ブラウザでプレイ/ランキング/共有を確認。iPhone Safari縦横の実機受入は別途必要。
4. 新版の公開確認後に実験場PR②を作る。`catalog/games.json`、`index.html`、`ranking.html` のイロアテの固定URL/共有文と、`docs/chameleonjp-lab/07_current_games_catalog.md` の現行カタログを更新。他ゲームのCodeberg URLを触らない。
5. 実験場PRをユーザーがマージしたら、[手動用SQL](docs/sql/iroate-url-after-deploy.sql)で `public.games` のiroate 1行・2列だけを旧→新URLへ置換。変更前値保存、行数=1、再取得、全記録のハッシュ再照合、実験場トップ/詳細→ゲーム遷移・共有を確認。

PRではテストとビルドだけ実行し、Pagesへの権限はmainのdeployジョブだけに付与します。公開ディレクトリは `dist/`、配備物にソースSHAを記録します。

現在の公開・受入状況は [作業記録](docs/release-2026-10-31.md) を参照してください。全段階の確認前には正式公開完了としません。

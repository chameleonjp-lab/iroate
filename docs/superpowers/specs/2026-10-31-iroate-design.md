# イロアテ 多言語・SE・公開先移行 設計と事前調査

ユーザー指定の詳細仕様を承認済み範囲とし、既存ゲーム・ランキング方式を維持する。

## 調査（2026-10-31 UTC）

- iroate main: `8161a245b6156eba239e15121d713b1a13f0c9a1`。index.html単体、既存テスト・マニフェストなし。
- sainome main: `79b1e57`。language-options.js、i18n.js、translations.js、locales/*、sound-effects.js、切替UIを確認。15言語、navigator.languages優先、保存済み指定優先、Web Audio合成、初期OFF。
- chameleonjp_lab main: `88ad6a8`。CLAUDE.md、README.md、共通仕様11、Supabase仕様03、catalog/games.json、トップ・詳細ランキングの固定データを確認。
- 共通規約は新しい冪等RPCへの移行を要求するが、今回はユーザーが現行方式維持・保存方式再設計禁止を明示。既存submit_score・client_versionを維持する。新規約適合を偽るマニフェストは作らず現状契約をREADMEへ記録。
- 全20問、意味10・表示色10、誤答+5秒、正解まで継続。単語色と表示色が異なる56組から各種50組を起動時抽出。回答色上限3を目指す選択、同種最大3連続、直前回答重複を優先回避する既存アルゴリズムを維持。
- Supabase `mlpnjgezrnhdxsxolyzj`、game_slug=iroate、client_version=iroate-ranking-v1、開始RPCなし、クリア時だけsubmit_score、ベスト/初回取得RPC各10件。保存先public.game_scores / public.score_runs。本番の関数定義・引数を読取確認。
- 本番gamesの1行: score_order=asc, score_unit=秒, score_scale=100, score_decimals=2, submission_mode=shared。
- 変更前game_url: `https://chameleonjp.codeberg.page/iroate/`
- 変更前share_text: `イロアテ\n文字の意味と文字の色を見分けて、20問の最終タイムを競うゲームです。\nhttps://chameleonjp.codeberg.page/iroate/`
- 変更前集計25件、履歴175件。全列の行ハッシュを個人名なしで比較用に保持。全体md5: game_scores=`a3d58ad196a515fa6c96294c8f696ddf`、score_runs=`c496ef4790e0111cda9002e0f7be8033`。本番試験送信なし。
- GitHub Pagesはbuilt、legacy、mainルート公開。新版未公開。main protected=false、rulesets=[]、保護詳細APIは403。Actionsは旧pages-build-deploymentのみ。
- buildRankingErrorTextのカンマ欠落を確認。文字列をタグ関数として呼ぶため構文検査だけでなく実行テストが必要。
- iroAteBestTimeは秒のJSON、iroAtePlayerNameは文字列。同一origin内はキー維持。CodebergとGitHubでは共有不可、自動移行できるとは案内しない。

## 方針と変更範囲

単一HTMLへの辞書埋込は保守困難。フレームワーク移行は差分過大。既存ロジックをES modulesへ抽出し、HTML/CSS・辞書・表示・音を分離する。

- 色ID/hex固定。問題はwordColorId/textColorId/correctColorIdで保持し表示だけ翻訳。cyanは既存の水色・明るい青緑の名称を使いblueと区別。
- サイノメと同じ言語順・検出・保存優先、iroate独自設定キー。未知言語/翻訳欠落/storage例外で停止しない。
- 開始時言語確定、カウントダウン/プレイ中切替無効。結果/ホームで切替可能。表示文を判定に使わない。
- SE: 選択/戻る/3・2・1/開始/正解/誤答/クリア/結果/自己ベスト/リタイア。初期OFF、短い合成音、処理を待たない。連続回答音は置換、OFF/非表示/中断で停止。
- 整数保存はMath.round((elapsedSeconds+misses*5)*100)。ローカルJSON構造、RPC引数・初回/ベスト・リタイア非送信維持。
- 通信停止でも結果/再戦を利用可能。自動再送しない（既存RPCは非冪等）。
- テスト→静的配備物作成→mainのみdeploy。PRはテストのみ。version.jsonとrelease metaでSHA照合。
- 実験場PRとgamesの2列更新はユーザーマージと新版公開・動作検証後。main直接push/自動マージ禁止。
- iPhone Safari実機不可なら未確認と明記。WebKitエミュレーションと区別する。

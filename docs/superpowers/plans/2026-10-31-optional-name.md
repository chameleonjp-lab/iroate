# Optional name and top-30 follow-up plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Track tasks below.

Goal: 名前任意、名前なし回数計測、結果で上位30名、イロアテ詳細ランキングへのリンクをPR①へ追加。
Spec: 2026-10-31のユーザー追加指定。前の名前必須という前提を置換する。他のゲーム仕様・保存記録保護・公開順序は継続。

Architecture / investigation:
- Takkeu main `5482a88b928744fa32fa562ab5b04073addf48d2` のhome任意入力、guestPlays.ts、guest専用RPC/tableとget_game_play_statsへの加算方式を確認。
- ホームに名前の任意欄。空欄で直接開始、入力時だけクリアスコアを既存submit_scoreで登録。保存済みiroAtePlayerNameを復元し、欄を空にすると参加解除。名前の公開を説明。
- 新規private.iroate_guest_plays_v1とstart_iroate_guest_play_v1で、名前・スコアを保存せず開始UUIDだけ記録。リタイアも1回。再送は同UUID、ページ/タブ間の再送でも重複なし。計測の通信はプレイを待たせない。
- get_game_play_statsの既存名前あり集計とtakkeu分岐をそのまま維持し、iroateの場合だけguest件数を加える。他ゲーム・public.gamesのURL/score設定・既存game_scores/score_runsを変更しない。名前あり登録回数は従来通りクリア登録時に加算。
- 結果は名前なし/リタイア/送信失敗でも初回/ベストを各最大30名取得。順位はサーバー値。送信失敗とランキング取得失敗を分離。名前なしの結果に登録済みと表示しない。
- ホーム/結果の詳細リンクは https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=iroate 。共有URLはゲーム正式URLのまま。
- 追加文言は全15言語。開始中の名前・言語はスナップショット固定。

Review focus: 旧名前の無意識送信、空白名、guestとnamedの二重計上、遅延応答の次ラウンド混入、匿名待機キューのオフライン/別タブ/ACK消失、SQL実行権限と他ゲームへの影響。

- [x] guestキューと実Postgres互換DBでmigrationの失敗テストを追加。権限/重複/他slug拒否/既存集計不変を検証。
- [x] guest専用RPC・集計の限定差分と非同期キューを実装、local DBで合格。
- [x] 名前任意、30名・詳細リンクのブラウザ失敗テストを追加して画面/辞書/通信を実装。
- [x] 独立した敵対的レビュー、修正と全試験。
- [x] 本番の変更前ハッシュ・集計・他ゲームのstatsを取得して、既存記録を変更しないDDLだけ適用、read-only/rollback試験、保全を再照合。
- [ ] PR①へ追記して最新CIを確認する。実験場URLの本番切替は依然新版公開後。

Ruling: 既存score RPCの再設計や名前あり保存方式移行を避け、guest countのみ追加する。タッケウのguest専用処理をイロアテ用に限定し、別作品のguest RPCを流用しない。

Verification: Node17件、ブラウザ全78件＋拒否応答等の更新後6件、構文36ファイル、25静的アセット合格。最新全80ケースはPRのCIで確認する。

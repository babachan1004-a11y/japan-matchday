# 日本人選手マッチデー

プレミアリーグの日本人選手が所属するクラブの日程と順位表を、スマホで確認するための静的サイト。

## 構成

```
GitHub Actions（定期実行） ── scripts/fetch-data.mjs ──▶ public/data.json
        │                    football-data.org v4（キーは Secrets）
        │                    └ 失敗時・キー未設定時は ESPN 公開エンドポイント
        └─ public/ をそのまま GitHub Pages にデプロイ（コミットはしない）
```

- 定期実行のタイミング（日本時間）：土日の 20:00〜翌7:59 は10分ごと、平日の 3:00〜7:59 は15分ごと、それ以外は3時間ごと
- ページは開いている間、試合中は2分ごと、それ以外は10分ごとに data.json を読み直す
- 追いかける選手の設定はブラウザの localStorage に保存（初期値は `public/clubs.js` の `DEFAULT_PLAYERS`）

## ローカルで確認

```bash
node scripts/fetch-data.mjs
node scripts/serve.mjs 8080
```

`FOOTBALL_DATA_TOKEN` 環境変数を設定すると football-data.org から取得します。

## メモ

- football-data.org の無料枠はスコアが遅れて反映されることがあります。キックオフ後もデータに反映されていない試合は「LIVE・更新待ち」と表示します
- ESPN のエンドポイントは非公式のため、予告なく使えなくなる可能性があります
- 新しいクラブの日本語名は `public/clubs.js` の `CLUBS` と `NAME_RULES` に追加します

【最初に読むファイル】

このフォルダは、GitHub にアップロードして、そのあと Vercel に読み込ませるためのセットです。

■ まずやること
1. GitHub の作った保管箱（Repository）を開く
2. Add file → Upload files を押す
3. このフォルダの中身を全部ドラッグする
4. Commit changes を押す
5. Vercel に戻る
6. New Project を押す
7. GitHub のこの Repository を選ぶ
8. Import を押す

■ Vercel で入れる環境変数（まずはデモ確認用）
VITE_DEMO_MODE=true
VITE_SYNC_PROVIDER=demo
VITE_GOOGLE_MAPS_API_KEY=dummy-google-maps-key
VITE_FIREBASE_API_KEY=dummy-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=dummy-demo.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dummy-demo-project
VITE_FIREBASE_STORAGE_BUCKET=dummy-demo.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demo000000
VITE_FIREBASE_MEASUREMENT_ID=G-DEMO0000

■ Vercel の設定
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist

■ 大事
- demo/index.html を直接開かない
- ZIP のまま GitHub に入れない
- 必ず展開したあとの中身を GitHub に入れる
- 環境変数を追加・変更したあと、再デプロイが必要

■ 次の段階
デモ表示が成功したら、次は本番 Firebase の値に入れ替えます。

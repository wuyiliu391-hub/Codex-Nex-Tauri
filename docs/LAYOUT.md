# 浠撳簱鐩綍甯冨眬

鏍圭洰褰曞彧淇濈暀 **鏋勫缓涓庡鑸繀闇€** 鐨勫叆鍙ｏ紱澶ф枃浠躲€佷复鏃朵骇鐗┿€佸巻鍙插疄楠岃剼鏈竴寰嬩笉鍏ュ簱銆?
## 鏍圭洰褰?
```text
Codex-Tauri/
鈹溾攢鈹€ README.md              # 鍏ュ彛
鈹溾攢鈹€ Cargo.toml / Cargo.lock
鈹溾攢鈹€ .gitignore
鈹溾攢鈹€ .github/               # CI
鈹溾攢鈹€ docs/                  # 鏂囨。
鈹溾攢鈹€ frontend/              # React + CSS/i18n
鈹溾攢鈹€ scripts/               # CI/鍗忚/鏍￠獙鑴氭湰锛堜粎淇濈暀蹇呴渶锛?鈹溾攢鈹€ src/                   # 瀹樻柟 codex-rust锛坵orkspace 鎴愬憳锛?鈹斺攢鈹€ src-tauri/             # Tauri 澹?+ binaries/
```

## 鍒嗗眰锛堣瑙?ARCHITECTURE.md锛?
| 鐩綍 | 灞?|
|------|-----|
| `frontend/` | L4 |
| `src-tauri/src/commands` + `lib.rs` | L3 |
| `src-tauri/src/codex/*` | L2 |
| `src-tauri/binaries/` | L1锛堝畼鏂?exe锛?|
| `<removed> | L0锛堜粎 in-process锛?|

## docs/锛堢簿绠€鍚庯級

```text
docs/
鈹溾攢鈹€ ARCHITECTURE.md
鈹溾攢鈹€ LAYOUT.md              # 鏈枃浠?鈹溾攢鈹€ RUST_BACKEND.md
鈹溾攢鈹€ provider-setup.md
鈹溾攢鈹€ official-ui/
鈹?  鈹溾攢鈹€ APPSERVER-METHOD-INVENTORY-0.154.0.md
鈹?  鈹溾攢鈹€ APPSERVER-METHOD-INVENTORY-0.154.0.json
鈹?  鈹斺攢鈹€ screens/
鈹溾攢鈹€ compose/change-notes/  # 鍙樻洿璁板綍
鈹斺攢鈹€ visual/                # 瀹樻柟鐣岄潰鍙傝€冩埅鍥?```

## scripts/锛圕I 涓庡崗璁繀闇€锛?
| 鑴氭湰 | 鐢ㄩ€?|
|------|------|
| `check-frontend.mjs` | 鍓嶇缁撴瀯妫€鏌ワ紙CI锛?|
| `stage-dist.ps1` | 灏?NSIS/MSI 瀹夎鍣ㄦ墎骞虫嫹鍒?`dist/`锛圕I/鏈湴浜х墿锛?|
| `verify-notification-coverage.mjs` | 閫氱煡瑕嗙洊锛圕I锛?|
| `migration-status.mjs` | 杩佺Щ鐘舵€侊紙lint-check锛?|
| `verify-agent-a-hex.cjs` | CSS token 鑹插€?|
| `verify-protocol-usage.mjs` | 鍗忚鐢ㄦ硶 |
| `gen-protocol.py` / `gen-protocol-ts.py` | 浠庡畼鏂规簮鐮佺敓鎴愬崗璁〃 |
| `diff-official-appserver-schema.mjs` | 瀹樻柟 generate-ts 宸垎 |
| `build.ps1` | 鏈湴/浜戠鏋勫缓鍏ュ彛 |

## 鏈湴浜х墿锛坓itignore锛屽嬁鎻愪氦锛?
| 璺緞 | 鍐呭 |
|------|------|
| `scratch/` | 涓存椂鐢熸垚锛坰chema銆佹棩蹇楋級 |
| `.agnes/` | 鏈湴 AI 宸ヤ綔鍖?|
| `codex-asar-extract/` | 瀹樻柟 asar 瑙ｅ寘 |
| `src-tauri/binaries/*.exe` | 寮曟搸浜岃繘鍒?|
| `frontend/dist/`銆乣target/` | 鏋勫缓杈撳嚭 |

## 娓呯悊瑙勫垯

1. 鏂拌剼鏈繘 `scripts/`锛?*鍏堢‘璁?CI/鍗忚鏄惁闇€瑕?*锛沀IA 鎶撳彇銆佷竴娆℃€?probe 涓嶈繘浠撳簱  
2. 鏂囨。杩?`docs/`锛?*涓庡綋鍓嶆灦鏋勭煕鐩剧殑鏃ф枃鐩存帴鍒?*锛屼笉瑕佺暀鐫€璇  
3. 瀹樻柟 exe 鍙斁 `src-tauri/binaries/`  
4. 瀹為獙杈撳嚭鍙斁鏈湴 `scratch/`锛坓itignore锛? 
5. 鏍圭洰褰曠姝㈠啀鍫?`.md` / `.cjs` / `.exe`  


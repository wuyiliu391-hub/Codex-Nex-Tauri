# Codex-Tauri 鏋舵瀯鍒嗗眰

> **涓€鍙ヨ瘽瀹氫綅**  
> 鐢?**Tauri v2** 鍐欑殑 Codex 妗岄潰澹筹細鍓嶇瀹屾暣浜や簰 鈫?澹冲眰 **浜у搧绾?Tauri IPC** 鈫?**瀹樻柟 app-server 鍗忚**锛堥粯璁?**棰勭紪璇?sidecar**锛夈€? 
> 涓嶆槸銆屾妸瀹樻柟妗岄潰 UI 鎼繘 Tauri銆嶇殑鍍忕礌鍏嬮殕锛岃€屾槸 **鍚屼竴寮曟搸鍗忚涓婄殑鑷湁妗岄潰浜у搧**銆?
鏂囨。鐗堟湰涓庝唬鐮佸榻愶細`rust-v0.154.0` 寮曟搸 / React 鍓嶇 / shell-only CI銆?
---

## 1. 鍒嗗眰鎬昏

```text
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? L4  Presentation 鈥?灞曠ず灞?                                      鈹?鈹?     React UI + 鏃?Wails 鍩虹嚎 CSS/DOM锛坈lass 濂戠害锛?              鈹?鈹?     鍙礋璐ｏ細甯冨眬銆佺粍浠躲€佹枃妗堛€佺敤鎴锋搷浣滃叆鍙?                       鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                             鈹? invoke / listen锛圱auri IPC锛?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? L3  Shell API 鈥?浜у搧 API 灞傦紙鍞竴鍓嶇渚濊禆闈級                   鈹?鈹?     src-tauri #[tauri::command] + 浜嬩欢妗?                       鈹?鈹?     鏈湴 store锛堣缃?瀹犵墿/鏃ュ巻/杩炴帴鍣ㄢ€︼級                         鈹?鈹?     寮曟搸 RPC 鍖呰锛堜細璇?瀹℃壒/config鈥︼級                          鈹?鈹?     缂哄彛鍦ㄦ琛ラ綈锛屼笉鍦ㄥ墠绔€犲亣                                   鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                             鈹? JSON-RPC锛圝SONL锛?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? L2  Engine Client 鈥?鍗忚瀹㈡埛绔眰                                鈹?鈹?     initialize 鈫?initialized 鎻℃墜                               鈹?鈹?     request/response + server鈫抍lient request 鍥炲寘               鈹?鈹?     notification 鈫?Tauri emit锛坈odex:*锛?                       鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                             鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? L1  Engine Host 鈥?寮曟搸鎵樼灞傦紙鍙垏鎹級                          鈹?鈹?     [浜у搧榛樿] Official sidecar锛?                              鈹?鈹?       openai/codex release exe 鈫?src-tauri/binaries/           鈹?鈹?     [寮曟搸瀹為獙] in-process锛氶摼 <removed>         鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?                             鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈻尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? L0  Official Engine 鈥?瀹樻柟寮曟搸濂戠害                              鈹?鈹?     app-server protocol锛圱hread / Turn / 瀹℃壒 / 浜嬩欢锛?         鈹?鈹?     experimentalApi: true锛堟湰椤圭洰宸插紑鍚級                       鈹?鈹?     鐪熺浉鏉ユ簮锛歝odex app-server generate-ts / json-schema        鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**浜у搧 API = L3銆?*  
鍓嶇姘歌繙涓嶇洿鎺ュ亣璁俱€宔xe 浼氭毚闇叉墍鏈夋闈㈣兘鍔涖€嶃€?
---

## 2. 鐩綍 鈫?鍒嗗眰鏄犲皠

| 璺緞 | 灞?| 鑱岃矗 |
|------|----|------|
| `frontend/app/**` | L4 | React 缁勪欢銆佺姸鎬併€佷簨浠舵ˉ銆佸瑙傚簲鐢?|
| `frontend/src/styles/**` | L4 | 鏃?Wails/瀹樻柟鐨偆 CSS锛坱oken + 椤甸潰鏍峰紡锛?|
| `frontend/src/js/i18n*.js` | L4 | 澶氳瑷€璇嶅吀锛沗t()` 鐢卞３璁剧疆鍚屾璇█ |
| `frontend/src/protocol/**` | L2/L3 杈呭姪 | 鐢熸垚鐨勯€氱煡/璇锋眰鏂规硶琛紙鍙笌瀹樻柟 schema 宸垎锛?|
| `src-tauri/src/lib.rs` | L3 | invoke_handler 娉ㄥ唽锛堜骇鍝佸懡浠ゆ竻鍗曪級 |
| `src-tauri/src/commands/**` | L3 | 鏈湴 store + 寮曟搸杞彂瀹炵幇 |
| `src-tauri/src/codex/client.rs` | L2 | WS/JSON-RPC 瀹㈡埛绔笌鎻℃墜 |
| `src-tauri/src/codex/sidecar.rs` | L1/L2 | 杩涚▼鎵樼銆佷簨浠舵车銆佷簩杩涘埗瑙ｆ瀽 |
| `src-tauri/src/codex/events.rs` | L2 | ServerMessage 鈫?`codex:*` Tauri 浜嬩欢 |
| `src-tauri/binaries/` | L1 | 瀹樻柟 `codex-app-server-*.exe`锛坓itignore锛?|
| `<removed> | L0 婧愮爜鏍?| 瀹樻柟 codex-rust锛?*浠?* in-process feature 浣跨敤 |
| `docs/ARCHITECTURE.md` | 鈥?| 鏈枃 |
| `docs/RUST_BACKEND.md` | L1/L2 | 浼犺緭銆佹柟娉曞悕銆佹彙鎵嬨€佸鎵瑰洖鍖?|
| `docs/official-ui/APPSERVER-METHOD-INVENTORY-*.md` | L0/L3 | 瀹樻柟鏂规硶闈?vs 椤圭洰鍗忚宸垎 |
| `.github/workflows/*` | 浜や粯 | shell-only CI + 瀹樻柟寮曟搸涓嬭浇 |
| `scripts/diff-official-appserver-schema.mjs` | 宸ュ叿 | 瀹樻柟 generate-ts 涓庨」鐩崗璁樊鍒?|


---

## 3. 鑱岃矗杈圭晫锛堢‖绾︽潫锛?
| 鍏佽 | 绂佹 |
|------|------|
| 鍓嶇鍙?`invoke` **L3 宸叉敞鍐屽懡浠?* / `listen` **codex:*** | 鍓嶇鍋囩偣鍑汇€佺┖澹虫寜閽€佸啓姝绘垚鍔?|
| L3 鐢?RPC 杞彂瀹樻柟宸叉湁鑳藉姏 | 鍦?UI 閲屽啀瀹炵幇涓€浠?Agent 涓氬姟閫昏緫 |
| L3 鐢ㄦ湰鍦?store 鍋氬畼鏂规病鏈夌殑妗岄潰鑳藉姏 | 涓轰簡銆岀湅璧锋潵鍍忓畼鏂广€嶄吉閫犲紩鎿庢暟鎹?|
| L0 鍗忚缂哄彛鍦?L3 琛?command | 闅忔剰鏀?`codex-core` Agent 寰幆 |
| UI 淇濇寔鏃?DOM/class/CSS 濂戠害 | 闅忔剰鍙戞槑 class 鎴栨敼 DOM 灞傜骇 |
| 寮曟搸鐗堟湰鍙樻洿鏃舵浛鎹?release 浜岃繘鍒?/ 閫夋嫨鎬у崌绾ф簮鐮?| 閫嗗悜/绡℃敼瀹樻柟 exe銆屽己琛屽紑鎺ュ彛銆?|
| `experimentalApi: true` 浣跨敤瀹樻柟瀹為獙鏂规硶 | 鍦ㄦ湭鐢熸垚 schema 鍓嶆墜鐚?RPC 鍚?|

---

## 4. 涓ゆ潯杩愯妯″紡

### A. 浜у搧妯″紡锛堥粯璁ゃ€丆I锛?
```text
cargo tauri build -- --no-default-features
# default features = []
# 寮曟搸 = 瀹樻柟 release:
#   github.com/openai/codex/releases/tag/rust-v0.154.0
#   codex-app-server-x86_64-pc-windows-msvc.exe
#   鈫?src-tauri/binaries/
```

- **缂栬瘧闈?*锛歚src-tauri` 澹?+ 鍓嶇锛屼笉缂?`<removed>  
- **閫傚悎**锛氭棩甯歌凯浠ｃ€佸嚭瀹夎鍖呫€佽窇閫氬畬鏁?UI IPC  

### B. 寮曟搸瀹為獙妯″紡锛堝彲閫夛級

```text
cargo build --features in-process
# 鎴?cargo tauri build -- --features in-process
```

- **缂栬瘧闈?*锛氬３ + 瀹樻柟婧愮爜闂寘锛堥噸锛? 
- **閫傚悎**锛氭敼閫傞厤灞傘€佸鍗忚琛屼负鍋氳繘绋嬪唴楠岃瘉  
- **涓嶆槸**銆屽墠绔帴鍙ｆ槸鍚﹀畬鏁淬€嶇殑鍓嶆彁鈥斺€斿畬鏁村害鍦?L3  

---

## 5. 鏍稿績鏁版嵁娴?
### 5.1 鐢ㄦ埛鎿嶄綔 鈫?寮曟搸

```text
鎸夐挳 / 琛ㄥ崟 (L4)
  鈫?invoke("send_message" | "list_sessions" | 鈥?  (L3)
    鈫?EngineHandle::rpc(JSON-RPC)                   (L2)
      鈫?sidecar exe / in-process                    (L1)
        鈫?official app-server                       (L0)
```

### 5.2 寮曟搸浜嬩欢 鈫?UI

```text
app-server notification / server request     (L0)
  鈫?broadcast ServerMessage                  (L1/L2)
    鈫?events.rs emit codex:turn-* / approval (L2)
      鈫?bridge/events.ts onNotification      (L4)
        鈫?turnStore / ApprovalHost 鈫?UI      (L4)
```

### 5.3 妗岄潰鐙湁鑳藉姏锛堟棤瀹樻柟 RPC锛?
```text
瀹犵墿 / 鏃ュ巻 / cinema / 杩炴帴鍣?/ 瀹氭椂浠诲姟 / PR 鈥?  鈫?浠?L3 鏈湴 store锛坰hell-state.json锛?  鈫?绂佹浼鎴愬紩鎿?RPC 鎴愬姛
```

---

## 6. 浜у搧 API 涓庡畼鏂瑰崗璁殑鍏崇郴

| 姒傚康 | 瀹氫箟 |
|------|------|
| **浜у搧 API** | `src-tauri` 娉ㄥ唽鐨?Tauri command + Tauri 浜嬩欢锛涘墠绔敮涓€濂戠害 |
| **瀹樻柟鍗忚** | app-server JSON-RPC锛圱hread/Turn/瀹℃壒/浜嬩欢 + experimental锛?|
| **鍏崇郴** | 浜у搧 API 鈯?f(瀹樻柟鍗忚) 鈭?鏈湴鑳藉姏锛涘畼鏂瑰崗璁笉蹇呰 UI 鍏ㄩ噺鏆撮湶 |

**瀹樻柟 0.154.0 鏂规硶闈㈡憳瑕?*锛堣瑙?inventory 鏂囨。锛夛細

- Schema 鎶藉嚭绾?**195** 涓柟娉? 
- 椤圭洰鍗忚宸茬偣鍚嶇害 **130**  
- **绾?65** 涓?official-only锛坅ccount/plugin/share銆乫s/*銆乼hreadSection銆乺eview銆亀indowsSandbox 绛夛級  
- 閫愭鎺ュ叆鏂瑰紡锛?*L3 鐪熷疄杞彂**锛岃€屼笉鏄墠绔洿杩炵寽鏂规硶鍚? 

鐢熸垚涓庡樊鍒嗭細

```text
codex app-server generate-ts --out ./schemas
codex app-server generate-json-schema --out ./schemas
node scripts/diff-official-appserver-schema.mjs
```

---

## 7. 鍓嶇涓庤瑙夊熀绾?
| 椤?| 绾﹀畾 |
|----|------|
| DOM / class | 瀵归綈鏃?Wails / vanilla锛坄home.css`銆乣settings.css`鈥︼級 |
| 涓婚 / 瀛楀彿 | `preferences` 鈫?`appearance.ts` 鍐欏洖 `html` class 涓?`--text-*` |
| 瀛椾綋 | OpenAI Sans锛坄tokens` / `official-tokens`锛?|
| i18n | 璇嶅吀鍦?`frontend/src/js/i18n*.js`锛涜瑷€鐢?L3 settings 鍚屾 |
| Design Token | 鏆備笉鏇挎崲涓恒€屽畼鏂归€嗗悜 token 鍏ㄩ噺閲嶅仛銆嶏紱娌跨敤鐜版湁 CSS 鍙橀噺灞?|

UI 鐩爣锛?*鏃у熀绾垮彲杈ㄨ瘑 + 鐪熷疄 IPC**锛屼笉鏄惀閿€绾у儚绱犲榻愩€?
---

## 8. 浜や粯涓?CI

| Workflow | 浣滅敤 |
|----------|------|
| `lint-check` | 鍓嶇闈欐€佹鏌?+ typecheck锛沗cargo fmt --check`锛坮ustc 閽夋锛?|
| `build-fast` | 涓嬭浇瀹樻柟 app-server 鈫?澹?`cargo tauri build -- --no-default-features` 鈫?`dist/` 鎵佸钩瀹夎鍖?artifact |
| `build-release` | 鍚屼笂绛栫暐 + 姝ｅ紡鎵撳寘锛坱ag锛?|

缂撳瓨鏍堬紙鍙€変紭鍖栵紝闈炴灦鏋勬湰璐級锛?
- 閽夋 `rustc 1.98.1`  
- Swatinem rust-cache + sccache GHA  
- 瀹樻柟寮曟搸浜岃繘鍒舵寜 release tag 缂撳瓨  

---

## 9. 瀹夊叏涓庡崌绾?
| 涓婚 | 绛栫暐 |
|------|------|
| 寮曟搸鐗堟湰 | 閽?`rust-v0.154.0` 涓€绫?tag锛涘崌绾ф椂鍚屾 schema 宸垎涓?L3 杞彂 |
| 浜岃繘鍒舵潵婧?| 浠呭畼鏂?GitHub Releases锛涙牎楠屼綋绉?鍙墽琛岋紱涓嶅叆搴擄紙gitignore锛?|
| 瀵嗛挜 | provider API key 璧板３灞傚瓨鍌?/ 鐜娉ㄥ叆锛屼笉杩涘墠绔?|
| 瀹℃壒 | server request 蹇呴』鍥炲寘锛坅ccept/decline/鈥︼級锛岄伩鍏?turn 鎸傛 |
| 閫嗗悜瀹樻柟 exe | **绂佹**浣滀负寮€鍙戣矾寰?|

---

## 10. 寮€鍙戣€呭揩閫熷湴鍥?
| 鎴戞兂鏀光€?| 鍘诲摢涓€灞?/ 鏂囦欢 |
|---------|----------------|
| 鎸夐挳鏍峰紡 / 甯冨眬 | `frontend/app/**` + `frontend/src/styles/**`锛堜繚鎸?class锛?|
| 鎸夐挳鐐逛笅鍘诲仛浠€涔?| 璇?TSX 鐨?`invoke("鈥?)` 鈫?`src-tauri/src/commands/**` |
| 鏂般€屽畼鏂规病鏈夈€嶇殑鍔熻兘 | 鍏堝姞 L3 command + 鏈湴 store锛屽啀鎺?UI |
| 鏂般€屽畼鏂瑰凡鏈夈€嶇殑鍔熻兘 | 鏌?inventory / `generate-ts` 鈫?L3 杞彂 鈫?UI |
| 浼氳瘽娴佹牱寮?| `blocks/registry.tsx` + `home.css`锛坄.message-row` / `.proc-line`锛?|
| 寮曟搸杩炰笉涓?| `sidecar.rs` 浜岃繘鍒惰В鏋愩€乣client.rs` 鎻℃墜銆乣events.rs` |
| 鍗忚鏂规硶鍚?| `docs/RUST_BACKEND.md` + `docs/official-ui/APPSERVER-METHOD-INVENTORY-*` |
| 鏈湴娣辩紪寮曟搸 | `--features in-process`锛堟帴鍙楃紪璇戞椂闂达級 |

---

## 11. 鎴愬姛鏍囧噯锛堟灦鏋勬槸鍚︺€屾竻鏅般€嶇殑楠屾敹锛?
1. 鏂板悓瀛﹁兘鍦?**10 鍒嗛挓** 鍐呰鍑?L0鈥揕4 鍚勮嚜鑱岃矗  
2. 浠讳竴 UI 鎺т欢鑳借拷婧埌 **鍞竴** 鐨?L3 command  
3. CI 榛樿鏋勫缓 **涓嶇紪** `<removed> 浠嶈兘鍑哄彲鐢ㄥ３ + 寮曟搸 sidecar  
4. 鍗忚浜夎浠?**瀹樻柟 generate-ts** 涓哄噯锛屼笉浠ュ崥瀹?缇よ亰涓哄噯  
5. 浠撳簱涓笉鍐嶅嚭鐜般€屽亣鎺ュ彛 / 绌?batchWrite / 鏈洃鍚?CustomEvent銆嶄綔涓轰氦浠樿矾寰? 

---

## 12. 鐩稿叧鏂囨。

| 鏂囨。 | 鍐呭 |
|------|------|
| [README.md](../README.md) | 椤圭洰鍏ュ彛 |
| [docs/LAYOUT.md](./LAYOUT.md) | 鐩綍甯冨眬 |
| [docs/RUST_BACKEND.md](./docs/RUST_BACKEND.md) | 寮曟搸闆嗘垚缁嗚妭 |
| [docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md](./docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md) | 瀹樻柟鏂规硶闈㈡竻鍗?|
| [docs/compose/change-notes/](./docs/compose/change-notes/) | 鍙樻洿璁板綍 |


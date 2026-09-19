---
kind: frontend_style
name: 基于 CSS 变量与官方 CDP 对齐的 Codex 桌面端样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - frontend/src/styles/tokens.css
    - frontend/src/styles/official-tokens.css
    - frontend/src/styles/reset.css
    - frontend/src/styles/shell.css
    - frontend/src/styles/components.css
    - frontend/src/styles/controls.css
    - frontend/src/styles/dark.css
    - frontend/app/styles/modal.css
---

## 1. 采用的系统/方法

- **纯 CSS + CSS 自定义属性（CSS Variables）设计令牌系统**：项目不使用 Tailwind、Styled Components、CSS Modules 或 Sass，而是通过 `:root`、`html.theme-dark`、`html[data-*]` 等选择器集中声明语义化 token，组件层仅引用这些变量。
- **官方 CDP 颜色对齐**：`official-tokens.css` 是“唯一合法来源”，注释明确说明其值来自 `docs/official-ui/cdp-resolved.json`，禁止自行发明 hex；所有其他文件中的语义别名必须用 `var()` 引用，不得硬编码颜色。
- **双主题（light/dark）**：通过给 `<html>` 添加 `theme-light` / `theme-dark` 类切换，dark 覆盖集中在 `tokens.css` 的 `html.theme-dark` 块和 `dark.css` 中。
- **字体系统**：OpenAI Sans 由 `official-tokens.css` 单一定义（Regular 400 + Medium 映射到 500/600/700），`tokens.css` 再定义 Carlito 作为代码字体，并通过 `--font-ui-family`、`--font-sans`、`--font-code-family` 等变量组合出 CJK 安全栈。用户可通过 `html[data-font-family="system|segoe|microsoft-yahei|pingfang|openai"]` 切换。
- **响应式/可访问性**：使用 `clamp()` 控制侧边栏宽度（`--spacing-token-sidebar`）、`prefers-reduced-motion` 媒体查询、`data-reduce-motion` 开关、`data-contrast=more` 高对比度模式、`data-pointer-cursors="off"` 关闭指针光标。

## 2. 关键文件

- `frontend/src/styles/tokens.css`：全局设计令牌中心——间距、字号、字重、圆角、阴影、语义色（surface/text/border/brand/status/composer/dropdown/popup/settings-switch/segmented/sidebar-tree/markdown/thread/shell/focus/selection/elevation）、暗色覆盖、字体族切换、对比度/运动偏好。
- `frontend/src/styles/official-tokens.css`：官方 CDP 解析出的 `--official-*` 原始色板与基础布局 token（sidebar width、toolbar height、radius 等），是唯一允许出现 hex 的地方。
- `frontend/src/styles/reset.css`：UA 重置，强制 `box-sizing: border-box`、清除原生表单外观、统一 focus-visible 为 accent ring、滚动条样式、打印样式、减少动效。
- `frontend/src/styles/shell.css`：应用骨架——`#app` 网格布局（sidebar + main）、标题栏拖拽区（`-webkit-app-region: drag`）、侧边栏 mesh 背景（classic/lavender 风格）、导航项、项目列表、主内容区、弹窗 toast、宠物叠加层。
- `frontend/src/styles/components.css`：内置组件库（`.btn`、`.input`、`.textarea`、`.select`、`.card`、`.switch`、`.segmented`、`.kbd`、`.pill`、`.swatch`、`.range`、`.checkbox`、`.radio`、`.icon-btn` 及通用工具类 `.flex`、`.gap-*`、`.rounded-*` 等）。
- `frontend/src/styles/controls.css`：Agent A UIA 皮肤原语（`.ui-button`、`.ui-input`、`.ui-toggle`、`.ui-popover`、`.ui-listbox`、`.ui-option`、`.ui-combobox`、`.ui-dropdown`），注释强调“无 hex，全部通过 tokens”。
- `frontend/src/styles/dark.css`：暗色主题下各卡片/面板/消息行的补充覆盖。
- `frontend/app/styles/modal.css`：模态对话框样式，同样完全基于 token。
- `frontend/src/assets/fonts/`：嵌入字体（OpenAISans-Regular/Medium.woff2、Carlito-latin-400/700.woff2）。

## 3. 架构与约定

- **加载顺序严格规定**：reset.css 注释写明 `Load order: tokens.css → official-tokens.css → reset.css → shell → components`，保证变量先于任何消费它们的样式。
- **分层职责清晰**：
  - `tokens.css` / `official-tokens.css`：设计令牌（颜色、尺寸、字体、阴影、圆角、间距）。
  - `reset.css`：浏览器默认行为清零。
  - `shell.css`：页面级布局与 chrome（标题栏、侧边栏、主区域）。
  - `components.css`：可复用控件样式。
  - `controls.css`：面向自动化（UIA）的无 JS 依赖控件原语。
  - `dark.css`：暗色主题增量覆盖。
- **命名约定**：组件类名采用 BEM 风格前缀（如 `.btn-primary`、`.btn-secondary`、`.ui-button--primary`、`.ui-modal-panel`）；主题通过 `html.theme-dark` 选择器而非 CSS-in-JS 切换。
- **颜色使用规则**：除 `official-tokens.css` 定义 `--official-*` 外，其余文件禁止裸 hex；必须通过 `--bg-*`、`--fg-*`、`--semantic-*`、`--accent-ring` 等语义变量引用，从而自动适配 light/dark。
- **字体合成策略**：`shell.css` 设置 `font-synthesis: none`，因此 `b/strong/h1-h6` 的 700 权重由 `official-tokens.css` 将 OpenAI Sans 700 映射到 Medium 字体文件实现真实粗体，而非浏览器伪粗体。
- **布局策略**：主布局使用 CSS Grid（`grid-template-columns: var(--spacing-token-sidebar) minmax(0, 1fr)`），侧边栏宽度通过 `clamp(240px, 275px, min(520px, calc(100vw - 320px)))` 自适应；支持 `body.sidebar-collapsed` 折叠、`body.settings-open` 全屏设置视图。

## 4. 约定与约束

- **禁止在组件样式中硬编码颜色**：`components.css` 头注释明确要求“颜色全部引用 tokens.css 的语义化变量”；`controls.css` 注释强调“No hex. All visuals via tokens”。
- **禁止重复声明 OpenAI Sans @font-face**：`tokens.css` 顶部注释明确禁止在此文件重新声明该家族，所有权归 `official-tokens.css`。
- **焦点可见性统一**：`reset.css` 将 `:focus` outline 置空，统一使用 `:focus-visible` + `--accent-ring` 或 `--focus-outline-color-light/dark`，不再使用红色焦点环。
- **主题切换方式固定**：通过给 `<html>` 添加 `theme-dark` / `theme-light` 类，以及 `data-font-family`、`data-contrast`、`data-reduce-motion`、`data-sidebar-style`、`data-pointer-cursors` 等 data 属性驱动样式变化。
- **侧边栏视觉风格可选**：通过 `html[data-sidebar-style="classic|lavender"]` 切换经典多径向渐变 mesh 背景，同时提供对应的 dark 变体。
- **移动端/无障碍**：`reset.css` 包含 `@media (prefers-reduced-motion: reduce)` 与 `@media print` 处理；`tokens.css` 提供 `data-reduce-motion=true` 时禁用所有动画/过渡的强覆盖。
- **Tauri/Wails 集成**：`shell.css` 使用 `-webkit-app-region: drag/no-drag` 标记标题栏拖拽区域，并兼容 `--wails-draggable` 属性以适配 Wails 壳。
- **向后兼容 fallback**：`tokens.css` 末尾使用 `@supports not (color-mix(...))` 提供不支持 `color-mix` 的浏览器降级方案，确保旧环境仍可显示基本配色。

总体而言，这是一个**以 CSS 变量为核心、严格对齐官方 CDP 色板、分层清晰的桌面端样式体系**，通过 theme class 与 data attribute 组合实现主题、字体、对比度与动效的可配置化，组件层保持无状态、无 JS 依赖的纯 CSS 实现。
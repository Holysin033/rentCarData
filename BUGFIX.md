# Bug 与修复记录

简要记录本项目在 `utils/db.js`、本地存储、`pages/statistics`、`pages/rental` 等与问题排查、功能调整相关的内容。

---

## 2026-04-12 — App 端 SQLite 初始化失败

**现象**  
控制台报错：`TypeError: plus.sqlite.open is not a function`，数据库初始化失败后走模拟数据。

**原因**  
HTML5+ 官方 API 为 `plus.sqlite.openDatabase`，不存在 `open`；关闭库应为 `closeDatabase` 而非 `close`；回调为 `success` / `fail`，不是 `error`；`executeSql` / `selectSql` 使用参数 **`name`**（库逻辑名），不是 `dbname`。  
另：模块加载时若将 `plus` 误判为不存在，会错误走 IndexedDB。

**修复**  
- 使用 `openDatabase`、`closeDatabase`、`fail`，以及 `name`。  
- 用 `hasPlusSqlite()` 等在**运行时**判断是否走 SQLite；App 包在 `plus` 未就绪时通过 `plusready` 再初始化。  
- 官方接口无占位符数组，增加 `bindPlusSqlParams` 将 `?` 绑定为字面量后再执行。

---

## 2026-04-12 — 插入保险记录报错「无 carName 列」

**现象**  
`SQLiteException: table insurance has no column named carName`，插入保险失败。

**原因**  
页面 `INSERT` / `UPDATE` 使用字段 `carName`，SQLite 建表仅有 `carNumber`，字段不一致。保养模块同样使用 `carName`，存在相同风险。

**修复**  
- 在 `insurance`、`maintenance` 建表语句中增加 `carName TEXT`。  
- 对已存在的旧库在初始化后执行 `ALTER TABLE ... ADD COLUMN carName TEXT`；若列已存在则忽略 `ALTER` 失败。

---

## 2026-04-12 — `showModal` 可编辑框字体颜色因机型黑/白不一致

**现象**  
使用 `uni.showModal` 且 `editable: true` 时，部分手机输入文字为黑色、部分为白色（或与背景对比度差），体验不统一。

**原因**  
可编辑弹窗走**系统原生对话框**样式，输入框文字颜色来自各 ROM / Android 版本 / 深色模式下的主题资源（厂商定制、Material 主题差异等）。该 API **一般不提供**字体颜色等细粒度样式，故无法仅靠业务参数在所有机型上固定为同一种颜色。

**规避**  
需要统一视觉时，不用系统可编辑 `showModal`，改为**页面内自定义弹层 + `input` 自行设 `color` / 背景**（例如租赁页续租/退租金额已改为自定义底部弹层）。

---

## 2026-04-12 — 租赁页续租/退租金额改为自定义弹层

**说明**  
属体验改进：用底部弹层展示当前应收、大号金额输入、变更后预览及校验，替代 `showModal` + `editable`，避免系统对话框样式不可控（参见上一条）。

**涉及**  
`pages/rental/rental.vue`

---

## 2026-04-12 — 统计页「按车名」展示月收入、年收入并可单独筛选月份

**需求**  
「按车名收入统计」去掉总收入、租约数；改为每车 **月收入**、**年收入**；月收入需能切换月份查看。

**实现要点**  
- `carStatsMonth` 与顶部 `selectedDate` 分离：顶部仍驱动卡片与「按月收入」表；按车名区块内 **picker** 只影响各车 **月收入** 汇总月份。  
- **年收入** = 所选月份所在 **自然年**（`startDate` 年份与该年一致）的累计。  
- 使用 `SELECT * FROM rental` 后在页面内按车名、月份、年份聚合，避免依赖 `db.js` 里 IndexedDB 简化 SQL 对复杂 `WHERE + GROUP BY` 的支持差异，**H5 / App SQLite 行为一致**。

**涉及**  
`pages/statistics/statistics.vue`

---

## 2026-04-12 — 统计页默认月份不应写死

**现象**  
`selectedDate`、`carStatsMonth` 初始为固定字符串（如 `2026-04`），与真实当前月份无关。

**修复**  
增加 `currentYearMonth()`，按系统日期生成 `YYYY-MM`，两处默认值均使用该值。

**涉及**  
`pages/statistics/statistics.vue`

---

## 说明

- 真机需勾选 **manifest → App 模块 → SQLite**，并使用含该模块的自定义基座或正式包。  
- 更完整的 5+ 错误码可参考：[DCloud 文档 / 错误码](https://ask.dcloud.net.cn/article/282)。

# Bug 与修复记录

简要记录本项目在 `utils/db.js`、本地存储、各业务页（含统计、租赁、保养、列表 Tab 等）的问题排查、兼容性与体验调整。

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

## 2026-04-13 — 统计页「按月收入」仅展示所选自然年

**需求**  
进入新年后仍展示往年所有月份会显得杂乱，需按 **自然年** 筛选「按月收入统计」表格。

**实现**  
- 增加 `monthlyStatsYear`（默认 **当年**）与年份 `picker`（`fields="year"`）。  
- `loadMonthlyData` 仍汇总全表各月，再在内存中过滤 `month` 以所选年份开头。  
- 无数据时提示「该年暂无租赁收入数据」。

**涉及**  
`pages/statistics/statistics.vue`

---

## 2026-04-13 — `picker` 的 `start` / `end` 类型告警（Number与 String）

**现象**  
控制台 Vue warn：`start` / `end` 期望 String，实际为 Number（如 1926、2126）。

**原因**  
部分运行环境下日期 `picker` 内部默认范围为数字，与组件声明的字符串日期不一致。

**修复**  
为本页所有日期类 `picker` 显式传入字符串日期：`pickerDateStart`、`pickerDateEnd`（如 `'1926-01-01'`、`'2126-12-31'`），绑定 `:start`、`:end`。

**涉及**  
`pages/statistics/statistics.vue`

---

## 2026-04-13 — 保养：里程与保养项目为选填，未填按默认入库

**需求**  
表单以车名、时间、费用为主；**里程**、**保养项目**可选：用户不填时存 **0** 与 **「无」**，填写则按实际保存。

**实现**  
- `add-maintenance`：`normalizeMileage` / `normalizeItems` 后插入。  
- `edit-maintenance`：展示时 0 /「无」以空框呈现；保存时写回规范化后的里程与项目（`UPDATE` 含 `mileage`、`items`）。

**涉及**  
`pages/maintenance/add-maintenance.vue`、`pages/maintenance/edit-maintenance.vue`

---

## 2026-04-13 — 列表 Tab 页：右下角「添加」浮动按钮与搜索栏样式

**需求**  
除 **统计** Tab 外，车辆 / 租赁 / 保险 / 保养列表页增加固定于 **右下、TabBar 上方** 的添加按钮；统一 **搜索栏** 视觉（胶囊框、渐变顶栏、主题色描边与 FAB 渐变区分模块）。

**实现**  
- 移除顶栏内重复的「添加」文字按钮，添加 **`fab-add`**（`@click.stop`，避免与租赁页整页点击冲突），`bottom` 含 `env(safe-area-inset-bottom)`。  
- 列表容器增加 **`padding-bottom`**，避免末条被 FAB 遮挡。  
- **统计页**无搜索栏、无 FAB，未改。

**涉及**  
`pages/index/index.vue`、`pages/rental/rental.vue`、`pages/insurance/insurance.vue`、`pages/maintenance/maintenance.vue`

---

## 2026-04-13 — 车辆照片选完仍不显示 / 路径无效

**现象**  
添加、编辑车辆选图后预览或列表无法显示；数据库里存的是类似 `static/carImgs/img_xxx.jpg` 的路径。

**原因**  
- `chooseImage` 成功回调**未使用** `res.tempFilePaths[0]`，却手写不存在的相对路径；**未**把临时文件复制到可持久位置。  
- **`static/`** 一般为打包资源，**运行时通常不可写入**，也不会自动出现用户选择的图片文件。

**修复**  
- 新增 **`utils/carImage.js`**：`chooseCarPhoto()` 内先 `uni.chooseImage`，再 **`uni.saveFile`**，将 **`savedFilePath`**（失败则回退临时路径）写入 `imagePath`。  
- **`pages/index/add-car.vue`、`edit-car.vue`** 改为调用 `chooseCarPhoto()`。

**涉及**  
`utils/carImage.js`、`pages/index/add-car.vue`、`pages/index/edit-car.vue`

---

## 2026-04-13 — 车辆列表缩略图

**需求**  
列表不再展示「照片路径」长文本，改为 **`<image>` 缩略图**（无图时占位）。

**实现**  
- **`pages/index/index.vue`**：每条左侧 **144rpx** 圆角缩略图，`mode="aspectFill"`，可选 `lazy-load`；无 `imagePath` 时灰色占位图标。

**说明**  
旧数据中仍为无效 `static/...` 路径时，缩略图可能裂图，需在编辑页重新选图保存。

---

## 2026-04-13 — 租约 JSON 导出 / 导入备份

**需求**  
仅备份 **rental** 表；顶栏「备份」可任选 **导出** 或 **导入**；导入会覆盖当前全部租约。

**实现**  
- **`utils/rentalBackup.js`**：`exportRentalBackup()`；`pickAndReadJsonFile()`（H5 用 `input[type=file]`，App 用 `chooseFile` + `readFile`）；`importRentalBackup()` 先 `DELETE FROM rental` 再逐条 `INSERT`。  
- **`utils/db.js`（IndexedDB）**：支持 **无 WHERE 的 `DELETE FROM 表名`**（`store.clear()`）；`INSERT` 改为 **`put`** 便于带 `id` 还原。  
- **`pages/rental/rental.vue`**：`showActionSheet` 选导入或导出；导入前 **`showModal`** 二次确认。

**涉及**  
`utils/rentalBackup.js`、`utils/db.js`、`pages/rental/rental.vue`

---

## 说明

- 真机需勾选 **manifest → App 模块 → SQLite**，并使用含该模块的自定义基座或正式包。  
- 更完整的 5+ 错误码可参考：[DCloud 文档 / 错误码](https://ask.dcloud.net.cn/article/282)。

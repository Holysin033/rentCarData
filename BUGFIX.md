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

## 2026-10-28 — 统计数字错误 / 显示 「暂无数据」 或 0

**现象**  
统计页月度、年度、总租赁收入偶尔为 0，或出现明显不符的假数据；「按月收入统计」常显示「该年暂无租赁收入数据」，重进页面数值才变。

**原因**  
均在 `utils/db.js` 的 IndexedDB 简化 SQL 层，非「数据库太臃肿」（图片只存 `imagePath`，不入库）：

1. `SELECT SUM(...) AS total FROM rental` **无 `GROUP BY`** 时，旧实现直接返回原始行数组，页面取 `res[0].total` 为 `undefined` → 0。  
2. `GROUP BY` 用 `/group by\s+([^;]+)/` 解析，把 `"month order by month"` 整段当分组字段 → 分组键取空，表格为空。  
3. 聚合金额用 `changedTotalAmount || initialTotalAmount`，金额为 **0** 时被 `||` 当假值，取到另一个字段，口径错误。  
4. `substr(startDate, 1, 4)`（按年）等写法不支持，仅识别 `1, 7`。  
5. 查询失败时页面兜底为「模拟数据」，用户看到的就是假数字。

**修复**  
- `queryIndexedDb` 重写为「解析 → 读取 → 聚合 → 排序 → LIMIT」流水线，新增 `parseWhereClause` / `parseSelectAliases` / `parseAggregates` / `parseGroupBy` / `parseOrderBy` / `parseLimit` / `sumExprValue` / `groupKeyValue` / `aggregateRows` / `sortRows` / `readRows` / `filterRows`。  
- 金额判断统一用 `== null`（`changedTotalAmount` → `initialTotalAmount` → `totalAmount`），0 不再被误判。  
- `GROUP BY` 正确剥离其后的 `ORDER BY` / `LIMIT`；支持 `substr(字段, 1, 4)` 与 `1, 7`。  
- 统计页删除旧的分组 SQL 与假数据兜底（对应上文 2026-04-13 「按月收入」条目中的 `loadMonthlyData`，该方法已整体移除）。

**涉及**  
`utils/db.js`、`pages/statistics/statistics.vue`

---

## 2026-10-28 — IndexedDB 升级 v2 建索引，避免全表扫描

**说明**  
IndexedDB 无 SQL 引擎，旧实现所有 `WHERE` 都要 `store.getAll()` 全表扫描。`dbVersion` 升至 **2**，在 `onupgradeneeded` 中用 `ensureStore` / `ensureIndex` 增量建索引（老库直接复用已有 store）：

- `car`：`name`
- `maintenance`：`carId`、`maintenanceDate`
- `insurance`：`carId`、`expireDate`
- `rental`：`carId`、`carName`、`startDate`

`readRows()` 命中主键（`WHERE id = ?`）或 `carId` 索引时直接按 key 取，不再全表遍历；索引无命中再回退全表 + 内存过滤。

**涉及**  
`utils/db.js`

---

## 2026-10-28 — 查询早于初始化完成 → 「数据库未初始化」

**现象**  
冷启动后首次进入统计/列表页，偶发查询失败并回退模拟数据；返回再进又正常。

**原因**  
`App.vue` 的 `initDb()` 是异步的，页面 `onShow` 可能先发起 `query`，此时 `db` 仍为 `null`，旧 `query` / `executeSql` 直接 `reject('数据库未初始化')`。

**修复**  
- `initDb()` 缓存并复用同一个 `initPromise`（失败后清空，允许重试）。  
- 新增 `waitForDb()`：`query` / `executeSql` 统一先等初始化完成再执行。  
- `initPlusSqlite` 未改动。

**涉及**  
`utils/db.js`

---

## 2026-10-28 — 减少重复查询（统计页 / 车辆列表）

**原因**  
- 统计页 `onLoad` + `onShow` 各刷新一次，每次 5 条 SQL（3 条 SUM + GROUP BY + 全表），冷启动约 10 次全表扫描。  
- 车辆列表每辆车各查 2 次保养/保险，N 辆车 = `1 + 2N` 次查询。  
- 租赁、保险、保养列表页同样 `onLoad` + `onShow` 双次加载。

**修复**  
- 统计页只保留 `onShow` → `refreshAll()`，**只读 1 次 `rental` 全表**，在 `computeAll()` 内存中一次算出月/年/总/按车四组数字（同一快照，口径一致）；picker 回调也走 `refreshAll()`。  
- 车辆列表新增 `fillLatestDates()`：固定 2 次批量查询，内存中按 `carId` 取最大日期。  
- 租赁 / 保险 / 保养列表页去掉 `onLoad` 重复加载，只保留 `onShow`。

**涉及**  
`pages/statistics/statistics.vue`、`pages/index/index.vue`、`pages/rental/rental.vue`、`pages/maintenance/maintenance.vue`、`pages/insurance/insurance.vue`

---

## 2026-10-28 — 真实数据验证：默认月份与按车名重复统计

**背景**  
用用户导出的真机库（`car_management.db`，25 辆车 / 290 条租约，最后一条租约在 **2026-05**）跑通全部页面查询，SQL 口径与页面内存汇总一致（总收入 50494、2026 年 49572）。发现两个「看起来统计出错」的体验问题：

1. **默认月份无数据 → 数字全是 0**：统计页默认取系统当前月（2026-10），该月没有任何租约，于是月度收入、按车月收入都是 0，用户误以为统计错误。
2. **车辆改名后按车名统计被拆成两行**：租约表 `carName` 是下单时快照，库中存在 `rental.carId=6` 的旧名「长安糯玉米鲁KDK8322」与 `car.name` 新名「白糯玉米鲁KDK8322」不一致，按名称分组会拆成两条记录。

**修复**  
- 统计页首次进入时自动定位到**最近有租约的月份**（读 `rental` 全表后取 `startDate` 最大值），并同步 `carStatsMonth` 与该年 `monthlyStatsYear`；之后尊重用户手动选择的 picker（`hasAutoPickedMonth` 只生效一次）。  
- 按车名统计改为**按 `carId` 归并**，显示名称取 `car.name`（无 `carId` 时才回退 `rental.carName`），列表 `:key` 改用 `id:<carId>`，避免重名/改名导致重复行。  
- `refreshAll()` 同时读 `car` 表（第 2 条查询），仍是固定 2 次查询。

验证结果（用该真机库）：自动定位 2026-05，月度 14688.00、2026 年 49572.00、总 50494.00；按车表 25 行，改名车辆合并为一行、年收入 1768.00。

**涉及**  
`pages/statistics/statistics.vue`

---

## 2026-10-30 — 替换 db 文件后报 `-1404 SQLiteCantOpenDatabaseException（is not readable）`

**现象**  
用户在手机上替换 `apps/<appid>/doc/car_management.db` 后启动 App：

```
{ "code": -1404, "message": "android.database.sqlite.SQLiteCantOpenDatabaseException: Cannot open database
'/storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/doc/car_management.db'
with flags 0x10000000: File ... is not readable" }
```

注意路径里是 `io.dcloud.HBuilder` → HBuilderX **标准基座**，其 `_doc` 就是 `apps/HBuilder/doc`，路径本身没错。

**原因**  
1. 通过文件管理器 / MTP / 电脑复制进 `Android/data/<包名>/doc` 的文件，属主通常不是 App 自身（多为 `media_rw`/`shell`），SELinux 上下文也不对，SQLite 以 App 身份打开即 `not readable`。  
2. 旧库还带着 `car_management.db-journal`（未提交的事务日志），SQLite 打开时要回滚，同样会打开失败。  
3. 替换时 App 仍在运行、库已打开，覆盖文件会让原句柄失效。

**修复（`utils/db.js`）**  
`initPlusSqlite(stage)` 增加三级自愈，只在 `-1404` / `CantOpen` / `not readable` 时触发：

- `stage 0` 失败 → `prepareDbForRetry()`：`java.io.File.setReadable/setWritable` 尝试恢复权限 + 删除 `car_management.db-journal`，然后 `stage 1` 重试。
- `stage 1` 仍失败 → `rebuildDbFile()`：用 `plus.io` 把 db `copyTo` 成 `car_management_rebuild.db`（新文件由 App 创建，属主/权限正常），删除原文件，再 `moveTo` 回 `car_management.db`，然后 `stage 2` 重试。
- `stage 2` 仍失败 → 抛出中文错误（说明需要先强杀 App、删 journal、再替换）。`App.vue` 在 App 端用 `showModal` 弹出该原因，不再只留一句控制台警告。

**为什么 Download 里的文件读不到（Android 11+ 分区存储）**  
真机验证：手机 `Download` 目录里确实有 `car_management.db`（76KB / 25 辆车），但自检显示「Download: 没有 db 文件」。原因是 App 能 `resolveLocalFileSystemURL` 到该目录，但 `readEntries` 列目录、读取 `.db`（非媒体文件）被 Scoped Storage 拦截；HBuilderX 标准基座 `io.dcloud.HBuilder` 没有 `MANAGE_EXTERNAL_STORAGE`，绕不过去。

**方案一（已废弃）：放进项目 `static/`**  
同日已移除：`static/car_management.db` 不再随包发布，`DB_BUNDLED_CANDIDATES` 与包内导入通道一并删除（避免把公司数据打进安装包）。历史做法：把 db 放 `static/`，随 wgt 部署到 `_www/static/`，启动时复制进 `_doc` 并打开；数据落到 `_doc` 后删除该文件。

**方案二：Download 目录（受权限限制）**  
放到 `/storage/emulated/0/Download/car_management.db` 后重新启动（或删掉库重开）。若仍显示「没有 db 文件」，即为上述分区存储限制，需改用「数据管理 → 导入数据库」（系统文件选择器，不受分区存储限制，见下节）。

导入候选（按顺序）：`/storage/emulated/0/Download/car_management.db` → `file:///...` → `_downloads/car_management.db`（包内 `static` 候选已删除）。  
去重：成功后记录「路径+大小+修改时间」指纹（`uni.setStorageSync('db_imported_mark')`），同一文件不会重复导入；文件更新（大小/时间变化）后会自动再导入一次。

失败时「数据库初始化失败」弹窗会带出具体原因，并提示把文件放到 Download 目录后点【重试】，无需重启 App。

**启动自检（已移除，仅作历史记录）**  
曾用「数据库自检」弹窗列出车辆/租约条数，以及 `doc:`（`_doc` 里的 db / journal）、`Download:`（公共 Download 是否有 db）、`已导入:`（来源路径）；完整结构输出到控制台 `DB诊断`，并提供【重新导入】按钮。该弹窗与相关函数已于 2026-10-30 删除，见下方「精简」。

旧的「直接覆盖 `_doc`」方式仍可用，但需：先在后台彻底划掉 App → 删除同目录的 `car_management.db-journal` → 再覆盖 → 重启。

**2026-10-30 精简**  
SAF 导入 / 导出走通后，移除调试用的启动自检弹窗与【重新导入】按钮（`showDbSelfCheck`、`findDir`/`describeDir`/`fmtSize`、`reimportDb`、`diagnoseDb`、`listDir`、`importDbFromDownloadNow` 均已删除）；启动只保留失败弹窗。同时删除 `static/car_management.db` 与包内 `static` 导入通道（`DB_BUNDLED_CANDIDATES`），安装包不再携带数据库。`Download` 自动导入通道与 `-1404` 三级自愈仍保留。

**附带修复：空库不再显示模拟数据**  
`pages/index/index.vue` 在查询结果为空时会填充「大众朗逸 / 丰田凯美瑞」两条假车辆，造成「自检 0 辆、列表却有车」的误判，已改为空列表（加载失败时同样为空）。

**涉及**  
`utils/db.js`、`App.vue`

---

## 2026-10-30 — 用户侧的库导入 / 导出（不依赖存储权限）

**背景**  
最终用户的库在 App 私有目录 `_doc`，普通用户拿不出来；把 db 放进公共 Download 又受 Android 11 分区存储限制（App 读不到 `.db` 这类非媒体文件），标准基座也无法申请「所有文件访问权限」。因此改为 **App 内自己选文件、自己写盘**。

**导入（`pages/data/import-db.vue` + `static/db-import.html`）**  
- 页面用 `<web-view src="/static/db-import.html">` 承载本地 HTML；  
- H5 里 `<input type="file" accept="*/*">` 调起系统文件选择器（SAF，无需权限），`FileReader.readAsDataURL` 读成 base64；  
- 按 20 万字符分片 `uni.postMessage({ type:'db-chunk', seq, total, data })`，桥接脚本为 `static/uni.webview.1.5.2.js`；  
- `import-db.vue` 收齐分片后调用 `importDbFromBase64()`：关库 → `FileWriter.writeAsBinary` 写 `_doc/car_management_import.db` → `replaceDocDbFile` 替换 → `initDb(true)` 重开（`skipImport` 避免被包内 static 覆盖）；  
- 单文件上限 8MB。

**导出（`pages/data/data.vue` → `exportDbToDownload()`）**  
- 关库 → 读 `_doc/car_management.db` 为 base64 → 用 `MediaStore`（`content://media/external/downloads`）写入公共 Download，文件名 `car_management_YYYYMMDD_HHmm.db`；  
- Android 10+ 走 MediaStore 无需存储权限，低于 10 直接提示不支持；  
- 成功或失败都会重新 `initDb(true)`，避免页面停留在「数据库未初始化」。

**导出报 `resolver insert is not a function`**  
`getContentResolver()`、`openOutputStream()` 返回的是 5+ 原始 Java 对象，**不会**像 `importClass` 导入的类那样把方法挂到 JS 对象上，直接 `.insert()` / `.write()` 必然报 “not a function”。改为：`ContentResolver`、`OutputStream` 上的方法一律用 `plus.android.invoke(obj, '方法名', ...参数)`（`getContentResolver`、`insert`、`openOutputStream`、`write`/`flush`/`close`）；`ContentValues` 用 `plus.android.newObject('android.content.ContentValues')` 创建，字段用 `invoke(values, 'put', ...)`；版本判断用 `parseInt(plus.os.version, 10)` 与 10 比较；`Base64.decode(base64, 0)`（`DEFAULT = 0`），并补 `openOutputStream` 返回空的判断。

**入口**  
`pages/index/index.vue` 搜索栏右侧新增「⋯」按钮 → `pages/data/data`，显示当前车辆/租约条数，提供导出、导入两个操作。

**注意**  
`static/car_management.db` 只是首次灌数据的临时文件（按指纹去重），数据已进 `_doc` 后应删除，否则该文件一变化，启动时会再覆盖一次。

---

## 说明

- 真机需勾选 **manifest → App 模块 → SQLite**，并使用含该模块的自定义基座或正式包。  
- 更完整的 5+ 错误码可参考：[DCloud 文档 / 错误码](https://ask.dcloud.net.cn/article/282)。

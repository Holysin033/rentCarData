# Bug 与修复记录

简要记录本项目在 `utils/db.js` 与本地存储相关的问题及处理方式。

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

## 说明

- 真机需勾选 **manifest → App 模块 → SQLite**，并使用含该模块的自定义基座或正式包。  
- 更完整的 5+ 错误码可参考：[DCloud 文档 / 错误码](https://ask.dcloud.net.cn/article/282)。

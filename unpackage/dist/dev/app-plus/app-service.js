if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  function formatAppLog(type, filename, ...args) {
    if (uni.__log__) {
      uni.__log__(type, filename, ...args);
    } else {
      console[type].apply(console, [...args, filename]);
    }
  }
  const dbName = "car_management";
  const dbVersion = 2;
  let db = null;
  let indexedDb = null;
  let initPromise = null;
  const DB_DOWNLOAD_CANDIDATES = [
    "/storage/emulated/0/Download/car_management.db",
    "file:///storage/emulated/0/Download/car_management.db",
    "_downloads/car_management.db"
  ];
  const DB_IMPORT_MARK_KEY = "db_imported_mark";
  function hasPlusSqlite() {
    return typeof plus !== "undefined" && plus.sqlite && typeof plus.sqlite.openDatabase === "function" && typeof plus.sqlite.executeSql === "function" && typeof plus.sqlite.selectSql === "function";
  }
  function useIndexedDbStorage() {
    return !hasPlusSqlite();
  }
  function bindPlusSqlParams(sql, params) {
    if (!params || params.length === 0) {
      return sql;
    }
    let i = 0;
    return sql.replace(/\?/g, () => {
      const v = params[i++];
      if (v === null || v === void 0) {
        return "NULL";
      }
      if (typeof v === "number" && Number.isFinite(v)) {
        return String(v);
      }
      return "'" + String(v).replace(/'/g, "''") + "'";
    });
  }
  function initDb(skipImport = false) {
    if (initPromise) {
      return initPromise;
    }
    initPromise = new Promise((resolve, reject) => {
      const runInit = () => {
        if (hasPlusSqlite()) {
          if (skipImport) {
            initPlusSqlite().then(resolve).catch(reject);
            return;
          }
          importDbFrom(DB_DOWNLOAD_CANDIDATES).then((res) => {
            if (res && res.installed) {
              formatAppLog("log", "at utils/db.js:71", "已导入数据库:", res.source);
            }
          }).then(() => initPlusSqlite()).then(resolve).catch(reject);
        } else {
          initIndexedDB().then(resolve).catch(reject);
        }
      };
      if (typeof plus !== "undefined") {
        runInit();
      } else if (typeof document !== "undefined") {
        document.addEventListener("plusready", runInit, { once: true });
      } else {
        runInit();
      }
    });
    initPromise.catch(() => {
      initPromise = null;
    });
    return initPromise;
  }
  function waitForDb() {
    if (db) {
      return Promise.resolve();
    }
    if (initPromise) {
      return initPromise.then(() => {
        if (!db) {
          throw "数据库未初始化";
        }
      });
    }
    return Promise.reject("数据库未初始化");
  }
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject("当前环境不支持IndexedDB");
        return;
      }
      if (indexedDb) {
        resolve();
        return;
      }
      const request = indexedDB.open(dbName, dbVersion);
      request.onerror = function(event) {
        reject("IndexedDB打开失败: " + event.target.error);
      };
      request.onsuccess = function(event) {
        indexedDb = event.target.result;
        db = dbName;
        resolve();
      };
      request.onupgradeneeded = function(event) {
        const idb = event.target.result;
        const upgradeTx = event.target.transaction;
        const ensureStore = (name) => {
          if (!idb.objectStoreNames.contains(name)) {
            return idb.createObjectStore(name, { keyPath: "id", autoIncrement: true });
          }
          return upgradeTx.objectStore(name);
        };
        const ensureIndex = (store, indexName, keyPath) => {
          if (store && !store.indexNames.contains(indexName)) {
            store.createIndex(indexName, keyPath, { unique: false });
          }
        };
        ensureIndex(ensureStore("car"), "name", "name");
        const insuranceStore = ensureStore("insurance");
        ensureIndex(insuranceStore, "carId", "carId");
        ensureIndex(insuranceStore, "expireDate", "expireDate");
        const maintenanceStore = ensureStore("maintenance");
        ensureIndex(maintenanceStore, "carId", "carId");
        ensureIndex(maintenanceStore, "maintenanceDate", "maintenanceDate");
        const rentalStore = ensureStore("rental");
        ensureIndex(rentalStore, "carId", "carId");
        ensureIndex(rentalStore, "carName", "carName");
        ensureIndex(rentalStore, "startDate", "startDate");
        ensureStore("statistics_config");
      };
    });
  }
  function initPlusSqlite(stage = 0) {
    return new Promise((resolve, reject) => {
      plus.sqlite.openDatabase({
        name: dbName,
        path: "_doc/" + dbName + ".db",
        success: function() {
          db = dbName;
          createTables().then(resolve).catch(reject);
        },
        fail: function(e) {
          if (!isDbCantOpenError(e) || stage >= 2) {
            reject(e);
            return;
          }
          if (stage === 0) {
            prepareDbForRetry().then(() => initPlusSqlite(1)).then(resolve).catch(reject);
          } else {
            rebuildDbFile().then(() => initPlusSqlite(2)).then(resolve).catch((err) => {
              reject({
                code: -1404,
                message: "数据库文件不可读，自动修复失败：" + toErrText(err) + "。请彻底关闭 App（从后台移除）后删除 car_management.db-journal，再替换 car_management.db 并重新启动。"
              });
            });
          }
        }
      });
    });
  }
  function isDbCantOpenError(e) {
    if (!e) {
      return false;
    }
    const text = typeof e === "string" ? e : e.message || e.msg || e.error || "";
    return e.code === -1404 || /CantOpen|not readable|Unable to open database/i.test(String(text));
  }
  function toErrText(err) {
    if (!err) {
      return "未知错误";
    }
    if (typeof err === "string") {
      return err;
    }
    return String(err.message || err.msg || err.error || JSON.stringify(err));
  }
  function prepareDbForRetry() {
    return new Promise((resolve) => {
      tryChmodDbFile();
      if (typeof plus === "undefined" || !plus.io) {
        resolve();
        return;
      }
      plus.io.resolveLocalFileSystemURL("_doc/" + dbName + ".db-journal", function(entry) {
        entry.remove(function() {
          resolve();
        }, function() {
          resolve();
        });
      }, function() {
        resolve();
      });
    });
  }
  function tryChmodDbFile() {
    try {
      const File = plus.android.importClass("java.io.File");
      const file = new File(plus.io.convertLocalFileSystemURL("_doc/" + dbName + ".db"));
      if (file.exists()) {
        file.setReadable(true, false);
        file.setWritable(true, false);
      }
    } catch (e) {
    }
  }
  function replaceDocDbFile(sourceUrl) {
    return new Promise((resolve, reject) => {
      if (typeof plus === "undefined" || !plus.io) {
        reject("plus.io 不可用");
        return;
      }
      const targetName = dbName + ".db";
      const tempName = dbName + "_rebuild.db";
      const journalName = targetName + "-journal";
      const removeQuiet = (name, next) => {
        plus.io.resolveLocalFileSystemURL("_doc/" + name, function(entry) {
          entry.remove(function() {
            next();
          }, function() {
            next();
          });
        }, function() {
          next();
        });
      };
      plus.io.resolveLocalFileSystemURL("_doc/", function(dirEntry) {
        plus.io.resolveLocalFileSystemURL(sourceUrl, function(srcEntry) {
          removeQuiet(tempName, function() {
            srcEntry.copyTo(dirEntry, tempName, function() {
              removeQuiet(targetName, function() {
                removeQuiet(journalName, function() {
                  plus.io.resolveLocalFileSystemURL("_doc/" + tempName, function(tempEntry) {
                    tempEntry.moveTo(dirEntry, targetName, function() {
                      resolve();
                    }, function(err) {
                      reject("替换数据库文件失败：" + toErrText(err));
                    });
                  }, function(err) {
                    reject("临时数据库文件解析失败：" + toErrText(err));
                  });
                });
              });
            }, function(err) {
              reject("数据库文件不可读：" + toErrText(err));
            });
          });
        }, function(err) {
          reject("未找到数据库文件：" + toErrText(err));
        });
      }, function(err) {
        reject("无法访问 _doc 目录：" + toErrText(err));
      });
    });
  }
  function rebuildDbFile() {
    return replaceDocDbFile("_doc/" + dbName + ".db");
  }
  function importDbFrom(candidates, force = false) {
    return new Promise((resolve) => {
      if (typeof plus === "undefined" || !plus.io) {
        resolve({ installed: false });
        return;
      }
      const mark = readImportMark();
      const tryNext = (index) => {
        if (index >= candidates.length) {
          resolve({ installed: false });
          return;
        }
        const url = candidates[index];
        plus.io.resolveLocalFileSystemURL(url, function(fileEntry) {
          const doImport = (fingerprint) => {
            replaceDocDbFile(url).then(() => {
              if (fingerprint) {
                writeImportMark(fingerprint);
              }
              resolve({ installed: true, source: url });
            }).catch(() => {
              tryNext(index + 1);
            });
          };
          fileEntry.getMetadata(function(meta) {
            const fingerprint = url + "|" + meta.size + "|" + meta.modificationTime;
            if (!force && mark === fingerprint) {
              resolve({ installed: false, skipped: true });
              return;
            }
            doImport(fingerprint);
          }, function() {
            doImport("");
          });
        }, function() {
          tryNext(index + 1);
        });
      };
      tryNext(0);
    });
  }
  function importDbFromBase64(base64) {
    if (!base64) {
      return Promise.reject("文件内容为空");
    }
    const tempName = dbName + "_import.db";
    return closeDb().catch(() => {
    }).then(() => {
      db = null;
      initPromise = null;
      return writeDocFile(tempName, base64);
    }).then(() => replaceDocDbFile("_doc/" + tempName)).then(() => initDb(true));
  }
  function exportDbToDownload() {
    const fileName = "car_management_" + formatStamp() + ".db";
    return closeDb().catch(() => {
    }).then(() => {
      db = null;
      initPromise = null;
      return readDocDbBase64();
    }).then((dataUrl) => {
      const base64 = String(dataUrl).replace(/^data:.*?,/, "");
      return saveToDownloads(fileName, base64);
    }).then(() => initDb(true)).then(() => fileName).catch((err) => {
      return initDb(true).catch(() => {
      }).then(() => {
        throw err;
      });
    });
  }
  function writeDocFile(name, base64) {
    return new Promise((resolve, reject) => {
      if (typeof plus === "undefined" || !plus.io) {
        reject("plus.io 不可用");
        return;
      }
      plus.io.resolveLocalFileSystemURL("_doc/", function(dirEntry) {
        const createAndWrite = function() {
          dirEntry.getFile(name, { create: true }, function(fileEntry) {
            fileEntry.createWriter(function(writer) {
              writer.onwrite = function() {
                resolve();
              };
              writer.onerror = function(e) {
                reject("写入文件失败：" + toErrText(e));
              };
              writer.writeAsBinary(base64);
            }, function(e) {
              reject("创建写入器失败：" + toErrText(e));
            });
          }, function(e) {
            reject("创建文件失败：" + toErrText(e));
          });
        };
        plus.io.resolveLocalFileSystemURL("_doc/" + name, function(entry) {
          entry.remove(createAndWrite, createAndWrite);
        }, createAndWrite);
      }, function(e) {
        reject("无法访问 _doc 目录：" + toErrText(e));
      });
    });
  }
  function readDocDbBase64() {
    return new Promise((resolve, reject) => {
      plus.io.resolveLocalFileSystemURL("_doc/" + dbName + ".db", function(entry) {
        entry.file(function(file) {
          const reader = new plus.io.FileReader();
          reader.onloadend = function(e) {
            resolve(String(e.target && e.target.result || ""));
          };
          reader.onerror = function() {
            reject("读取数据库文件失败");
          };
          reader.readAsDataURL(file);
        }, function() {
          reject("读取数据库文件失败");
        });
      }, function() {
        reject("未找到数据库文件");
      });
    });
  }
  function saveToDownloads(fileName, base64) {
    return new Promise((resolve, reject) => {
      try {
        const version = parseInt(plus.os.version, 10) || 0;
        if (version < 10) {
          reject("系统版本低于 Android 10，暂不支持导出到 Download 目录");
          return;
        }
        const Uri = plus.android.importClass("android.net.Uri");
        const Base64 = plus.android.importClass("android.util.Base64");
        const values = plus.android.newObject("android.content.ContentValues");
        plus.android.invoke(values, "put", "_display_name", fileName);
        plus.android.invoke(values, "put", "mime_type", "application/octet-stream");
        const main = plus.android.runtimeMainActivity();
        const resolver = plus.android.invoke(main, "getContentResolver");
        const collection = Uri.parse("content://media/external/downloads");
        const uri = plus.android.invoke(resolver, "insert", collection, values);
        if (!uri) {
          reject("无法在 Download 目录创建文件");
          return;
        }
        const out = plus.android.invoke(resolver, "openOutputStream", uri);
        if (!out) {
          reject("无法写入 Download 目录");
          return;
        }
        plus.android.invoke(out, "write", Base64.decode(base64, 0));
        plus.android.invoke(out, "flush");
        plus.android.invoke(out, "close");
        resolve();
      } catch (e) {
        reject("导出失败：" + toErrText(e));
      }
    });
  }
  function formatStamp() {
    const d = /* @__PURE__ */ new Date();
    const p = (n) => n < 10 ? "0" + n : String(n);
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes());
  }
  function readImportMark() {
    try {
      return uni.getStorageSync(DB_IMPORT_MARK_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function writeImportMark(fingerprint) {
    try {
      uni.setStorageSync(DB_IMPORT_MARK_KEY, fingerprint);
    } catch (e) {
    }
  }
  function createTables() {
    return new Promise((resolve, reject) => {
      const createCarTable = `
			CREATE TABLE IF NOT EXISTS car (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				carNumber TEXT,
				imagePath TEXT,
				createdAt TEXT
			);
		`;
      const createInsuranceTable = `
			CREATE TABLE IF NOT EXISTS insurance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				carId INTEGER,
				carNumber TEXT,
				carName TEXT,
				company TEXT,
				expireDate TEXT,
				premium REAL,
				createdAt TEXT,
				FOREIGN KEY (carId) REFERENCES car(id)
			);
		`;
      const createMaintenanceTable = `
			CREATE TABLE IF NOT EXISTS maintenance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				carId INTEGER,
				carNumber TEXT,
				carName TEXT,
				maintenanceDate TEXT,
				mileage INTEGER,
				cost REAL,
				items TEXT,
				createdAt TEXT,
				FOREIGN KEY (carId) REFERENCES car(id)
			);
		`;
      const createRentalTable = `
			CREATE TABLE IF NOT EXISTS rental (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				carId INTEGER,
				carName TEXT,
				startDate TEXT,
				endDate TEXT,
				days INTEGER,
				dailyRate REAL,
				initialTotalAmount REAL,
				changeAmount REAL,
				changeAction TEXT,
				changedTotalAmount REAL,
				renterName TEXT,
				renterPhone TEXT,
				status TEXT,
				createdAt TEXT,
				updatedAt TEXT,
				FOREIGN KEY (carId) REFERENCES car(id)
			);
		`;
      const createStatisticsTable = `
			CREATE TABLE IF NOT EXISTS statistics_config (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				key TEXT UNIQUE,
				value TEXT,
				updatedAt TEXT
			);
		`;
      const statements = [
        createCarTable,
        createInsuranceTable,
        createMaintenanceTable,
        createRentalTable,
        createStatisticsTable
      ];
      const runNext = (index) => {
        if (index >= statements.length) {
          migratePlusSqliteLegacyColumns().then(resolve).catch(reject);
          return;
        }
        plus.sqlite.executeSql({
          name: dbName,
          sql: statements[index],
          success: function() {
            runNext(index + 1);
          },
          fail: function(e) {
            reject(e);
          }
        });
      };
      runNext(0);
    });
  }
  function migratePlusSqliteLegacyColumns() {
    return new Promise((resolve) => {
      const alters = [
        "ALTER TABLE insurance ADD COLUMN carName TEXT",
        "ALTER TABLE maintenance ADD COLUMN carName TEXT"
      ];
      const runNext = (i) => {
        if (i >= alters.length) {
          resolve();
          return;
        }
        plus.sqlite.executeSql({
          name: dbName,
          sql: alters[i],
          success: function() {
            runNext(i + 1);
          },
          fail: function() {
            runNext(i + 1);
          }
        });
      };
      runNext(0);
    });
  }
  function executeSql(sql, params = []) {
    return waitForDb().then(() => new Promise((resolve, reject) => {
      if (useIndexedDbStorage()) {
        executeIndexedDb(sql, params).then(resolve).catch(reject);
      } else {
        const boundSql = bindPlusSqlParams(sql, params);
        plus.sqlite.executeSql({
          name: dbName,
          sql: boundSql,
          success: function(res) {
            resolve(res);
          },
          fail: function(e) {
            reject(e);
          }
        });
      }
    }));
  }
  function query(sql, params = []) {
    return waitForDb().then(() => new Promise((resolve, reject) => {
      if (useIndexedDbStorage()) {
        queryIndexedDb(sql, params).then(resolve).catch(reject);
      } else {
        const boundSql = bindPlusSqlParams(sql, params);
        plus.sqlite.selectSql({
          name: dbName,
          sql: boundSql,
          success: function(res) {
            resolve(res);
          },
          fail: function(e) {
            reject(e);
          }
        });
      }
    }));
  }
  function closeDb() {
    return new Promise((resolve, reject) => {
      if (!db) {
        resolve();
        return;
      }
      if (useIndexedDbStorage()) {
        if (indexedDb) {
          indexedDb.close();
          indexedDb = null;
        }
        db = null;
        resolve();
      } else {
        plus.sqlite.closeDatabase({
          name: dbName,
          success: function() {
            db = null;
            resolve();
          },
          fail: function(e) {
            reject(e);
          }
        });
      }
    });
  }
  function executeIndexedDb(sql, params) {
    return new Promise((resolve, reject) => {
      try {
        const lowerSql = sql.toLowerCase();
        let tableName = "";
        let operation = "";
        if (lowerSql.startsWith("insert into")) {
          operation = "insert";
          tableName = lowerSql.match(/insert into\s+(\w+)/)[1];
        } else if (lowerSql.startsWith("update")) {
          operation = "update";
          tableName = lowerSql.match(/update\s+(\w+)/)[1];
        } else if (lowerSql.startsWith("delete from")) {
          operation = "delete";
          tableName = lowerSql.match(/delete from\s+(\w+)/)[1];
        }
        if (!tableName) {
          reject("不支持的SQL操作");
          return;
        }
        const transaction = indexedDb.transaction([tableName], "readwrite");
        const store = transaction.objectStore(tableName);
        if (operation === "insert") {
          const fieldsMatch = sql.match(/\(([^)]+)\)/);
          const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
          if (fieldsMatch && valuesMatch) {
            const fields = fieldsMatch[1].split(",").map((field) => field.trim());
            const values = params;
            const item = {};
            fields.forEach((field, index) => {
              if (index < values.length) {
                item[field] = values[index];
              }
            });
            const request = store.put(item);
            request.onsuccess = function() {
              resolve({ affectedRows: 1 });
            };
            request.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的INSERT语句");
          }
        } else if (operation === "update") {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
          if (idMatch && params.length > 0) {
            const id = params[params.length - 1];
            const getRequest = store.get(id);
            getRequest.onsuccess = function(event) {
              const item = event.target.result;
              if (item) {
                const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
                if (setMatch) {
                  const setClause = setMatch[1].trim();
                  const fields = setClause.split(",").map((field) => field.trim().split("=")[0].trim());
                  fields.forEach((field, index) => {
                    if (index < params.length - 1) {
                      item[field] = params[index];
                    }
                  });
                }
                const request = store.put(item);
                request.onsuccess = function() {
                  resolve({ affectedRows: 1 });
                };
                request.onerror = function(event2) {
                  reject(event2.target.error);
                };
              } else {
                reject("记录不存在");
              }
            };
            getRequest.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的UPDATE语句");
          }
        } else if (operation === "delete") {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
          if (idMatch && params.length > 0) {
            const id = params[0];
            const request = store.delete(id);
            request.onsuccess = function() {
              resolve({ affectedRows: 1 });
            };
            request.onerror = function(event) {
              reject(event.target.error);
            };
          } else if (/^\s*delete\s+from\s+\w+\s*;?\s*$/i.test(sql.trim())) {
            const clearReq = store.clear();
            clearReq.onsuccess = function() {
              resolve({ affectedRows: 1 });
            };
            clearReq.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的DELETE语句");
          }
        }
        transaction.oncomplete = function() {
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  function queryIndexedDb(sql, params) {
    return new Promise((resolve, reject) => {
      if (!indexedDb) {
        reject("数据库未初始化");
        return;
      }
      const fromMatch = sql.match(/\bfrom\s+(\w+)/i);
      if (!fromMatch) {
        reject("不支持的SQL查询");
        return;
      }
      const tableName = fromMatch[1];
      const where = parseWhereClause(sql);
      readRows(tableName, where, params).then((rows) => {
        try {
          const aliases = parseSelectAliases(sql);
          const aggregates = parseAggregates(sql);
          const groupBy = parseGroupBy(sql);
          const orderBy = parseOrderBy(sql);
          const limit = parseLimit(sql);
          let result = groupBy || aggregates.length ? aggregateRows(rows, groupBy, aggregates, aliases) : rows;
          result = sortRows(result, orderBy);
          if (limit > 0) {
            result = result.slice(0, limit);
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }).catch(reject);
    });
  }
  function parseWhereClause(sql) {
    const m = sql.match(/where\s+([\s\S]+?)(?:\s+order\s+by\s|\s+group\s+by\s|\s+limit\s|;|$)/i);
    if (!m) {
      return null;
    }
    const clause = m[1].trim();
    if (/^id\s*=\s*\?$/i.test(clause)) {
      return { kind: "id" };
    }
    if (/^carid\s*=\s*\?$/i.test(clause)) {
      return { kind: "carId" };
    }
    const sub = clause.match(/^substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*=\s*\?$/i);
    if (sub) {
      return { kind: "substr", field: sub[1], start: parseInt(sub[2], 10), len: parseInt(sub[3], 10) };
    }
    const eq = clause.match(/^(\w+)\s*=\s*\?$/i);
    if (eq) {
      return { kind: "eq", field: eq[1] };
    }
    return null;
  }
  function parseSelectAliases(sql) {
    const fromIndex = sql.search(/\bfrom\b/i);
    const selectList = fromIndex > 0 ? sql.substring(0, fromIndex) : sql;
    const aliases = {};
    const re = /(substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)|\w+)\s+as\s+(\w+)/gi;
    let m;
    while (m = re.exec(selectList)) {
      const alias = m[5];
      if (m[2]) {
        aliases[alias] = { kind: "substr", field: m[2], start: parseInt(m[3], 10), len: parseInt(m[4], 10) };
      } else {
        aliases[alias] = { kind: "field", field: m[1] };
      }
    }
    return aliases;
  }
  function parseAggregates(sql) {
    const fromIndex = sql.search(/\bfrom\b/i);
    const selectList = fromIndex > 0 ? sql.substring(0, fromIndex) : sql;
    const list = [];
    let m;
    const sumRe = /sum\s*\(([\s\S]*?)\)\s+as\s+(\w+)/gi;
    while (m = sumRe.exec(selectList)) {
      list.push({ type: "sum", expr: m[1].trim(), alias: m[2] });
    }
    const countRe = /count\s*\(\s*(?:\*|[\w.]+)\s*\)\s+as\s+(\w+)/gi;
    while (m = countRe.exec(selectList)) {
      list.push({ type: "count", alias: m[1] });
    }
    return list;
  }
  function parseGroupBy(sql) {
    const m = sql.match(/group\s+by\s+([\s\S]+?)(?:\s+order\s+by\s|\s+limit\s|;|$)/i);
    return m ? m[1].trim() : null;
  }
  function parseOrderBy(sql) {
    const m = sql.match(/order\s+by\s+([\s\S]+?)(?:\s+limit\s|;|$)/i);
    if (!m) {
      return [];
    }
    return m[1].split(",").map((part) => {
      const text = part.trim().replace(/\s+/g, " ");
      if (!text) {
        return null;
      }
      const desc = /\bdesc\b/i.test(text);
      const field = text.replace(/\b(asc|desc)\b/gi, "").trim();
      return field ? { field, desc } : null;
    }).filter(Boolean);
  }
  function parseLimit(sql) {
    const m = sql.match(/limit\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }
  function sumExprValue(expr, row) {
    const text = String(expr || "").trim();
    const caseMatch = text.match(
      /^case\s+when\s+(\w+)\s+is\s+not\s+null\s+then\s+(\w+)\s+else\s+(\w+)\s+end$/i
    );
    let field;
    if (caseMatch) {
      field = row[caseMatch[1]] != null ? caseMatch[2] : caseMatch[3];
    } else {
      field = text.replace(/[^A-Za-z0-9_]/g, "");
    }
    const value = parseFloat(row[field]);
    return Number.isFinite(value) ? value : 0;
  }
  function groupKeyValue(row, groupToken, aliases) {
    const token = String(groupToken).trim();
    const inline = token.match(/^substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (inline) {
      const value2 = row[inline[1]];
      return value2 == null ? "" : String(value2).substr(parseInt(inline[2], 10) - 1, parseInt(inline[3], 10));
    }
    const alias = aliases[token];
    if (alias && alias.kind === "substr") {
      const value2 = row[alias.field];
      return value2 == null ? "" : String(value2).substr(alias.start - 1, alias.len);
    }
    const field = alias && alias.kind === "field" ? alias.field : token;
    const value = row[field];
    return value == null ? "" : String(value);
  }
  function aggregateRows(rows, groupBy, aggregates, aliases) {
    const buildRow = (groupRows, key) => {
      const out = {};
      if (groupBy) {
        out[groupBy] = key;
      }
      aggregates.forEach((agg) => {
        if (agg.type === "count") {
          out[agg.alias] = groupRows.length;
        } else {
          let total = 0;
          groupRows.forEach((row) => {
            total += sumExprValue(agg.expr, row);
          });
          out[agg.alias] = total;
        }
      });
      return out;
    };
    if (!groupBy) {
      return [buildRow(rows, "")];
    }
    const groups = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const key = groupKeyValue(row, groupBy, aliases);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });
    return Array.from(groups.keys()).map((key) => buildRow(groups.get(key), key));
  }
  function sortRows(rows, orderBy) {
    if (!orderBy || orderBy.length === 0) {
      return rows;
    }
    const copy = rows.slice();
    copy.sort((a, b) => {
      for (let i = 0; i < orderBy.length; i++) {
        const { field, desc } = orderBy[i];
        const av = a[field];
        const bv = b[field];
        let cmp;
        if (typeof av === "string" || typeof bv === "string") {
          cmp = String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
        } else {
          cmp = (Number(av) || 0) - (Number(bv) || 0);
        }
        if (cmp !== 0) {
          return desc ? -cmp : cmp;
        }
      }
      return 0;
    });
    return copy;
  }
  function readRows(tableName, where, params) {
    return new Promise((resolve, reject) => {
      const fail = (event) => reject(event && event.target && event.target.error || new Error("IndexedDB读取失败"));
      let transaction;
      try {
        transaction = indexedDb.transaction([tableName], "readonly");
      } catch (error) {
        reject(error);
        return;
      }
      const store = transaction.objectStore(tableName);
      if (where && where.kind === "id" && params && params.length > 0) {
        const req = store.get(params[0]);
        req.onsuccess = () => resolve(req.result ? [req.result] : []);
        req.onerror = fail;
        return;
      }
      if (where && where.kind === "carId" && params && params.length > 0) {
        const key = params[0];
        const hasIndex = store.indexNames && store.indexNames.contains("carId");
        if (hasIndex) {
          const indexReq = store.index("carId").getAll(key);
          indexReq.onsuccess = () => {
            if (indexReq.result && indexReq.result.length > 0) {
              resolve(indexReq.result);
              return;
            }
            const allReq2 = store.getAll();
            allReq2.onsuccess = () => resolve(filterRows(allReq2.result || [], where, params));
            allReq2.onerror = fail;
          };
          indexReq.onerror = fail;
          return;
        }
      }
      const allReq = store.getAll();
      allReq.onsuccess = () => resolve(filterRows(allReq.result || [], where, params));
      allReq.onerror = fail;
    });
  }
  function filterRows(rows, where, params) {
    if (!where || !params || params.length === 0) {
      return rows;
    }
    if (where.kind === "id") {
      return rows.filter((row) => row.id == params[0]);
    }
    if (where.kind === "carId") {
      return rows.filter((row) => row.carId == params[0]);
    }
    if (where.kind === "substr") {
      const value = params[0];
      return rows.filter((row) => {
        const fieldValue = row[where.field];
        return fieldValue != null && String(fieldValue).substr(where.start - 1, where.len) == value;
      });
    }
    if (where.kind === "eq") {
      return rows.filter((row) => row[where.field] == params[0]);
    }
    return rows;
  }
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _sfc_main$f = {
    data() {
      return {
        carList: [],
        searchKeyword: ""
      };
    },
    onShow() {
      this.loadCarList();
    },
    computed: {
      filteredCarList() {
        if (!this.searchKeyword) {
          return this.carList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.carList.filter(
          (item) => item.name.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car ORDER BY id DESC`;
        query(sql).then((res) => {
          this.carList = (res || []).map((car) => Object.assign({}, car, {
            latestMaintenance: "无",
            latestInsurance: "无"
          }));
          this.fillLatestDates();
        }).catch((err) => {
          formatAppLog("error", "at pages/index/index.vue:90", "加载车辆列表失败:", err);
          this.carList = [];
        });
      },
      /**
       * 一次性批量读取保养/保险表，在内存中按 carId 取最新日期。
       * 原实现每辆车各查 2 次（车辆 10 台就是 21 次查询），改为固定 2 次查询。
       */
      fillLatestDates() {
        Promise.all([
          query("SELECT carId, maintenanceDate FROM maintenance"),
          query("SELECT carId, expireDate FROM insurance")
        ]).then(([maintenanceRows, insuranceRows]) => {
          const latestByCarId = (rows, dateField) => {
            const map = {};
            (rows || []).forEach((row) => {
              const carId = row.carId;
              if (carId == null) {
                return;
              }
              const date = row[dateField] || "";
              if (date && (!map[carId] || date > map[carId])) {
                map[carId] = date;
              }
            });
            return map;
          };
          const maintenanceMap = latestByCarId(maintenanceRows, "maintenanceDate");
          const insuranceMap = latestByCarId(insuranceRows, "expireDate");
          this.carList.forEach((car) => {
            car.latestMaintenance = maintenanceMap[car.id] || "无";
            car.latestInsurance = insuranceMap[car.id] || "无";
          });
        }).catch((err) => {
          formatAppLog("warn", "at pages/index/index.vue:125", "加载保养/保险日期失败:", err);
        });
      },
      addCar() {
        uni.navigateTo({
          url: "./add-car"
        });
      },
      openDataPage() {
        uni.navigateTo({
          url: "../data/data"
        });
      },
      editCar(item) {
        uni.navigateTo({
          url: "./edit-car?id=" + item.id
        });
      },
      deleteCar(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这辆车吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM car WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.carList = this.carList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/index/index.vue:161", "删除失败:", err);
                this.carList = this.carList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$e(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "搜索车辆名称",
              class: "search-input",
              "confirm-type": "search",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("view", {
          class: "header-action",
          onClick: _cache[2] || (_cache[2] = (...args) => $options.openDataPage && $options.openDataPage(...args))
        }, [
          vue.createElementVNode("text", { class: "header-action-icon" }, "⋯")
        ])
      ]),
      vue.createElementVNode("view", { class: "car-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredCarList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "car-item"
            }, [
              vue.createElementVNode("view", { class: "car-item-body" }, [
                vue.createElementVNode("view", { class: "car-thumb-wrap" }, [
                  item.imagePath ? (vue.openBlock(), vue.createElementBlock("image", {
                    key: 0,
                    class: "car-thumb",
                    src: item.imagePath,
                    mode: "aspectFill",
                    "lazy-load": ""
                  }, null, 8, ["src"])) : (vue.openBlock(), vue.createElementBlock("view", {
                    key: 1,
                    class: "car-thumb-placeholder"
                  }, [
                    vue.createElementVNode("text", { class: "car-thumb-icon" }, "🚗")
                  ]))
                ]),
                vue.createElementVNode("view", { class: "item-content" }, [
                  vue.createElementVNode(
                    "text",
                    { class: "car-name" },
                    vue.toDisplayString(item.name),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "car-number" },
                    "车牌号：" + vue.toDisplayString(item.carNumber || "未填写"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "maintenance-date" },
                    "最新保养：" + vue.toDisplayString(item.latestMaintenance || "无"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "insurance-date" },
                    "最新保险：" + vue.toDisplayString(item.latestInsurance || "无"),
                    1
                    /* TEXT */
                  )
                ])
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editCar(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteCar(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", {
        class: "fab-add",
        onClick: _cache[3] || (_cache[3] = vue.withModifiers((...args) => $options.addCar && $options.addCar(...args), ["stop"]))
      }, [
        vue.createElementVNode("text", { class: "fab-add-icon" }, "+")
      ])
    ]);
  }
  const PagesIndexIndex = /* @__PURE__ */ _export_sfc(_sfc_main$f, [["render", _sfc_render$e], ["__scopeId", "data-v-1cf27b2a"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/index.vue"]]);
  function chooseCarPhoto() {
    return new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ["compressed", "original"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const tempPath = res.tempFilePaths && res.tempFilePaths[0];
          if (!tempPath) {
            reject(new Error("未获取到图片"));
            return;
          }
          if (typeof uni.saveFile === "function") {
            uni.saveFile({
              tempFilePath: tempPath,
              success: (saveRes) => {
                resolve(saveRes.savedFilePath);
              },
              fail: (err) => {
                formatAppLog("warn", "at utils/carImage.js:24", "saveFile 失败，使用临时路径（部分环境重启后可能失效）", err);
                resolve(tempPath);
              }
            });
          } else {
            resolve(tempPath);
          }
        },
        fail: (err) => reject(err || new Error("选择图片失败"))
      });
    });
  }
  const _sfc_main$e = {
    data() {
      return {
        car: {
          name: "",
          carNumber: "",
          imagePath: ""
        }
      };
    },
    methods: {
      saveCar() {
        if (!this.car.name) {
          uni.showToast({
            title: "请输入车名",
            icon: "none"
          });
          return;
        }
        const sql = `INSERT INTO car (name, carNumber, imagePath, createdAt) VALUES (?, ?, ?, ?)`;
        const params = [this.car.name, this.car.carNumber, this.car.imagePath, (/* @__PURE__ */ new Date()).toISOString()];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "保存成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/index/add-car.vue:72", "保存失败:", err);
          uni.showToast({
            title: "保存失败",
            icon: "none"
          });
        });
      },
      chooseImage() {
        chooseCarPhoto().then((savedPath) => {
          this.car.imagePath = savedPath;
          uni.showToast({ title: "图片已保存", icon: "success" });
        }).catch((err) => {
          formatAppLog("error", "at pages/index/add-car.vue:86", "选择图片失败:", err);
          uni.showToast({
            title: err && err.errMsg ? err.errMsg : "选择图片失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$d(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, [
            vue.createTextVNode("车名 "),
            vue.createElementVNode("text", { style: { "color": "red" } }, "*")
          ]),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.car.name = $event),
              placeholder: "请输入车名",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.name]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车牌号"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.car.carNumber = $event),
              placeholder: "请输入车牌号（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.carNumber]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "照片"),
          vue.createElementVNode("view", { class: "image-upload" }, [
            $data.car.imagePath ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "image-preview"
            }, [
              vue.createElementVNode("view", { class: "image-container" }, [
                vue.createElementVNode("image", {
                  src: $data.car.imagePath,
                  mode: "aspectFit",
                  class: "preview-image"
                }, null, 8, ["src"])
              ]),
              vue.createElementVNode("button", {
                onClick: _cache[2] || (_cache[2] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "change-image-btn"
              }, "更换图片")
            ])) : (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "image-placeholder"
            }, [
              vue.createElementVNode("button", {
                onClick: _cache[3] || (_cache[3] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "choose-image-btn"
              }, "选择图片"),
              vue.createElementVNode("text", { class: "hint" }, "选择后保存到应用本地目录，列表与编辑页可正常显示")
            ]))
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.saveCar && $options.saveCar(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesIndexAddCar = /* @__PURE__ */ _export_sfc(_sfc_main$e, [["render", _sfc_render$d], ["__scopeId", "data-v-a389b924"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/add-car.vue"]]);
  const _sfc_main$d = {
    data() {
      return {
        car: {
          id: "",
          name: "",
          carNumber: "",
          imagePath: ""
        }
      };
    },
    onLoad(options) {
      this.car.id = parseInt(options.id);
      this.loadCarInfo();
    },
    methods: {
      loadCarInfo() {
        const sql = `SELECT * FROM car WHERE id = ?`;
        query(sql, [this.car.id]).then((res) => {
          if (res && res.length > 0) {
            this.car = res[0];
          } else {
            this.car = {
              id: this.car.id,
              name: "大众朗逸",
              carNumber: "京A12345",
              imagePath: ""
            };
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/index/edit-car.vue:71", "加载车辆信息失败:", err);
          this.car = {
            id: this.car.id,
            name: "大众朗逸",
            carNumber: "京A12345",
            imagePath: ""
          };
        });
      },
      updateCar() {
        if (!this.car.name) {
          uni.showToast({
            title: "请输入车名",
            icon: "none"
          });
          return;
        }
        const sql = `UPDATE car SET name = ?, carNumber = ?, imagePath = ? WHERE id = ?`;
        const params = [this.car.name, this.car.carNumber, this.car.imagePath, this.car.id];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "更新成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/index/edit-car.vue:104", "更新失败:", err);
          uni.showToast({
            title: "更新失败",
            icon: "none"
          });
        });
      },
      chooseImage() {
        chooseCarPhoto().then((savedPath) => {
          this.car.imagePath = savedPath;
          uni.showToast({ title: "图片已保存", icon: "success" });
        }).catch((err) => {
          formatAppLog("error", "at pages/index/edit-car.vue:118", "选择图片失败:", err);
          uni.showToast({
            title: err && err.errMsg ? err.errMsg : "选择图片失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$c(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, [
            vue.createTextVNode("车名 "),
            vue.createElementVNode("text", { style: { "color": "red" } }, "*")
          ]),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.car.name = $event),
              placeholder: "请输入车名",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.name]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车牌号"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.car.carNumber = $event),
              placeholder: "请输入车牌号（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.carNumber]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "照片"),
          vue.createElementVNode("view", { class: "image-upload" }, [
            $data.car.imagePath ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "image-preview"
            }, [
              vue.createElementVNode("view", { class: "image-container" }, [
                vue.createElementVNode("image", {
                  src: $data.car.imagePath,
                  mode: "aspectFit",
                  class: "preview-image"
                }, null, 8, ["src"])
              ]),
              vue.createElementVNode("button", {
                onClick: _cache[2] || (_cache[2] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "change-image-btn"
              }, "更换图片")
            ])) : (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "image-placeholder"
            }, [
              vue.createElementVNode("button", {
                onClick: _cache[3] || (_cache[3] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "choose-image-btn"
              }, "选择图片"),
              vue.createElementVNode("text", { class: "hint" }, "选择后保存到应用本地目录，列表与编辑页可正常显示")
            ]))
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.updateCar && $options.updateCar(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesIndexEditCar = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["render", _sfc_render$c], ["__scopeId", "data-v-adc15339"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/edit-car.vue"]]);
  const _sfc_main$c = {
    data() {
      return {
        insuranceList: [],
        searchKeyword: ""
      };
    },
    onShow() {
      this.loadInsuranceList();
    },
    computed: {
      filteredInsuranceList() {
        if (!this.searchKeyword) {
          return this.insuranceList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.insuranceList.filter(
          (item) => item.carName.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadInsuranceList() {
        const sql = `SELECT * FROM insurance ORDER BY id DESC`;
        query(sql).then((res) => {
          this.insuranceList = res || [];
          this.checkExpiringInsurance();
          if (this.insuranceList.length === 0) {
            this.insuranceList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                company: "平安保险",
                expireDate: "2026-12-31",
                premium: 5e3
              },
              {
                id: 2,
                carName: "本田雅阁",
                company: "人保财险",
                expireDate: "2026-10-15",
                premium: 4500
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/insurance/insurance.vue:89", "加载保险列表失败:", err);
          this.insuranceList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              company: "平安保险",
              expireDate: "2026-12-31",
              premium: 5e3
            },
            {
              id: 2,
              carName: "本田雅阁",
              company: "人保财险",
              expireDate: "2026-10-15",
              premium: 4500
            }
          ];
        });
      },
      checkExpiringInsurance() {
        const today = /* @__PURE__ */ new Date();
        const thirtyDaysLater = /* @__PURE__ */ new Date();
        thirtyDaysLater.setDate(today.getDate() + 30);
        const expiringInsurance = this.insuranceList.filter((item) => {
          const expireDate = new Date(item.expireDate);
          return expireDate >= today && expireDate <= thirtyDaysLater;
        });
        if (expiringInsurance.length > 0) {
          uni.showModal({
            title: "保险到期提醒",
            content: `有 ${expiringInsurance.length} 条保险即将到期，请及时处理。`,
            showCancel: false
          });
        }
      },
      addInsurance() {
        uni.navigateTo({
          url: "./add-insurance"
        });
      },
      editInsurance(item) {
        uni.navigateTo({
          url: "./edit-insurance?id=" + item.id
        });
      },
      deleteInsurance(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这条保险记录吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM insurance WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.insuranceList = this.insuranceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/insurance/insurance.vue:157", "删除失败:", err);
                this.insuranceList = this.insuranceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$b(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "搜索车辆名称",
              class: "search-input",
              "confirm-type": "search",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "insurance-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredInsuranceList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "insurance-item"
            }, [
              vue.createElementVNode("view", { class: "item-content" }, [
                vue.createElementVNode(
                  "text",
                  { class: "car-number" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "insurance-company" },
                  vue.toDisplayString(item.company),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "expire-date" },
                  "到期日期：" + vue.toDisplayString(item.expireDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "premium" },
                  "保费：" + vue.toDisplayString(item.premium) + "元",
                  1
                  /* TEXT */
                )
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editInsurance(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteInsurance(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", {
        class: "fab-add fab-add-insurance",
        onClick: _cache[2] || (_cache[2] = vue.withModifiers((...args) => $options.addInsurance && $options.addInsurance(...args), ["stop"]))
      }, [
        vue.createElementVNode("text", { class: "fab-add-icon" }, "+")
      ])
    ]);
  }
  const PagesInsuranceInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$c, [["render", _sfc_render$b], ["__scopeId", "data-v-4afc8b09"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/insurance.vue"]]);
  const _sfc_main$b = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        insurance: {
          company: "",
          expireDate: "",
          premium: ""
        }
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
            if (this.carList.length > 0) {
              this.selectedCar = this.carList[0];
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/add-insurance.vue:66", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
            this.selectedCar = this.carList[0];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.insurance.expireDate = e.detail.value;
      },
      saveInsurance() {
        if (!this.selectedCar || !this.insurance.company || !this.insurance.expireDate || !this.insurance.premium) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `INSERT INTO insurance (carId, carName, company, expireDate, premium, createdAt) VALUES (?, ?, ?, ?, ?, ?)`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.insurance.company, this.insurance.expireDate, this.insurance.premium, (/* @__PURE__ */ new Date()).toISOString()];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "保存成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/add-insurance.vue:126", "保存失败:", err);
            uni.showToast({
              title: "保存失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "保存成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$a(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保险公司"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.insurance.company = $event),
              placeholder: "请输入保险公司",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.company]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "到期日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[2] || (_cache[2] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.insurance.expireDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.insurance.expireDate || "请选择到期日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保费"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.insurance.premium = $event),
              placeholder: "请输入保费",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.premium]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.saveInsurance && $options.saveInsurance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesInsuranceAddInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["render", _sfc_render$a], ["__scopeId", "data-v-08dc6034"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/add-insurance.vue"]]);
  const _sfc_main$a = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        insurance: {
          id: "",
          company: "",
          expireDate: "",
          premium: ""
        }
      };
    },
    onLoad(options) {
      this.insurance.id = options.id;
      this.loadCarList();
      this.loadInsuranceInfo();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:66", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        }
      },
      loadInsuranceInfo() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM insurance WHERE id = ?`;
          query(sql, [this.insurance.id]).then((res) => {
            if (res && res.length > 0) {
              this.insurance = res[0];
              const carIndex = this.carList.findIndex((car) => car.id === this.insurance.carId);
              if (carIndex !== -1) {
                this.selectedCarIndex = carIndex;
                this.selectedCar = this.carList[carIndex];
              }
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:109", "加载保险信息失败:", err);
            this.insurance = {
              id: this.insurance.id,
              company: "平安保险",
              expireDate: "2026-12-31",
              premium: 5e3
            };
            this.selectedCar = this.carList[0];
          });
        } else {
          this.insurance = {
            id: this.insurance.id,
            company: "平安保险",
            expireDate: "2026-12-31",
            premium: 5e3
          };
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.insurance.expireDate = e.detail.value;
      },
      updateInsurance() {
        if (!this.selectedCar || !this.insurance.company || !this.insurance.expireDate || !this.insurance.premium) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `UPDATE insurance SET carId = ?, carName = ?, company = ?, expireDate = ?, premium = ? WHERE id = ?`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.insurance.company, this.insurance.expireDate, this.insurance.premium, this.insurance.id];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "更新成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:161", "更新失败:", err);
            uni.showToast({
              title: "更新失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "更新成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$9(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保险公司"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.insurance.company = $event),
              placeholder: "请输入保险公司",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.company]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "到期日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[2] || (_cache[2] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.insurance.expireDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.insurance.expireDate || "请选择到期日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保费"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.insurance.premium = $event),
              placeholder: "请输入保费",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.premium]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.updateInsurance && $options.updateInsurance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesInsuranceEditInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["render", _sfc_render$9], ["__scopeId", "data-v-50aea87a"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/edit-insurance.vue"]]);
  const _sfc_main$9 = {
    data() {
      return {
        maintenanceList: [],
        searchKeyword: ""
      };
    },
    onShow() {
      this.loadMaintenanceList();
    },
    computed: {
      filteredMaintenanceList() {
        if (!this.searchKeyword) {
          return this.maintenanceList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.maintenanceList.filter(
          (item) => item.carName.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadMaintenanceList() {
        const sql = `SELECT * FROM maintenance ORDER BY id DESC`;
        query(sql).then((res) => {
          this.maintenanceList = res || [];
          if (this.maintenanceList.length === 0) {
            this.maintenanceList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                maintenanceDate: "2026-03-15",
                mileage: 1e4,
                cost: 800,
                items: "机油更换、机滤更换"
              },
              {
                id: 2,
                carName: "本田雅阁",
                maintenanceDate: "2026-02-20",
                mileage: 15e3,
                cost: 1200,
                items: "机油更换、机滤更换、空滤更换"
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/maintenance/maintenance.vue:90", "加载保养列表失败:", err);
          this.maintenanceList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              maintenanceDate: "2026-03-15",
              mileage: 1e4,
              cost: 800,
              items: "机油更换、机滤更换"
            },
            {
              id: 2,
              carName: "本田雅阁",
              maintenanceDate: "2026-02-20",
              mileage: 15e3,
              cost: 1200,
              items: "机油更换、机滤更换、空滤更换"
            }
          ];
        });
      },
      addMaintenance() {
        uni.navigateTo({
          url: "./add-maintenance"
        });
      },
      editMaintenance(item) {
        uni.navigateTo({
          url: "./edit-maintenance?id=" + item.id
        });
      },
      deleteMaintenance(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这条保养记录吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM maintenance WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.maintenanceList = this.maintenanceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/maintenance/maintenance.vue:140", "删除失败:", err);
                this.maintenanceList = this.maintenanceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$8(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "搜索车辆名称",
              class: "search-input",
              "confirm-type": "search",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "maintenance-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredMaintenanceList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "maintenance-item"
            }, [
              vue.createElementVNode("view", { class: "item-content" }, [
                vue.createElementVNode(
                  "text",
                  { class: "car-number" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "maintenance-date" },
                  "保养日期：" + vue.toDisplayString(item.maintenanceDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "mileage" },
                  "保养里程：" + vue.toDisplayString(item.mileage) + "公里",
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "cost" },
                  "费用：" + vue.toDisplayString(item.cost) + "元",
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "items" },
                  "保养项目：" + vue.toDisplayString(item.items),
                  1
                  /* TEXT */
                )
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editMaintenance(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteMaintenance(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", {
        class: "fab-add fab-add-maintenance",
        onClick: _cache[2] || (_cache[2] = vue.withModifiers((...args) => $options.addMaintenance && $options.addMaintenance(...args), ["stop"]))
      }, [
        vue.createElementVNode("text", { class: "fab-add-icon" }, "+")
      ])
    ]);
  }
  const PagesMaintenanceMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["render", _sfc_render$8], ["__scopeId", "data-v-e50a8caf"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/maintenance.vue"]]);
  const _sfc_main$8 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        maintenance: {
          maintenanceDate: "",
          cost: "",
          mileage: "",
          items: ""
        }
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
            if (this.carList.length > 0) {
              this.selectedCar = this.carList[0];
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/add-maintenance.vue:71", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
            this.selectedCar = this.carList[0];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.maintenance.maintenanceDate = e.detail.value;
      },
      /** 未填或无效 → 0 */
      normalizeMileage(val) {
        if (val === "" || val === null || val === void 0)
          return 0;
        const n = parseInt(String(val).trim(), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      },
      /** 未填或空白 → 「无」 */
      normalizeItems(val) {
        const s = val == null ? "" : String(val).trim();
        return s === "" ? "无" : s;
      },
      saveMaintenance() {
        if (!this.selectedCar || !this.maintenance.maintenanceDate || this.maintenance.cost === "" || this.maintenance.cost === null) {
          uni.showToast({
            title: "请填写车名、时间与费用",
            icon: "none"
          });
          return;
        }
        const costNum = parseFloat(this.maintenance.cost);
        if (Number.isNaN(costNum) || costNum < 0) {
          uni.showToast({ title: "费用请输入有效数字", icon: "none" });
          return;
        }
        const mileage = this.normalizeMileage(this.maintenance.mileage);
        const items = this.normalizeItems(this.maintenance.items);
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `INSERT INTO maintenance (carId, carName, maintenanceDate, mileage, cost, items, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.maintenance.maintenanceDate, mileage, costNum, items, (/* @__PURE__ */ new Date()).toISOString()];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "保存成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/add-maintenance.vue:149", "保存失败:", err);
            uni.showToast({
              title: "保存失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "保存成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$7(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "时间"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[1] || (_cache[1] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.maintenance.maintenanceDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.maintenance.maintenanceDate || "请选择日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "费用"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.maintenance.cost = $event),
              placeholder: "请输入费用（元）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.cost]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养里程（选填）"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.maintenance.mileage = $event),
              placeholder: "不填默认为 0",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.mileage]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养项目（选填）"),
          vue.withDirectives(vue.createElementVNode(
            "textarea",
            {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $data.maintenance.items = $event),
              placeholder: "不填默认为「无」",
              class: "textarea"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.items]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.saveMaintenance && $options.saveMaintenance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[6] || (_cache[6] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesMaintenanceAddMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["render", _sfc_render$7], ["__scopeId", "data-v-cf4facb6"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/add-maintenance.vue"]]);
  const _sfc_main$7 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        maintenance: {
          id: "",
          maintenanceDate: "",
          cost: "",
          mileage: "",
          items: ""
        }
      };
    },
    onLoad(options) {
      this.maintenance.id = options.id;
      this.loadCarList();
      this.loadMaintenanceInfo();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:71", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        }
      },
      loadMaintenanceInfo() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM maintenance WHERE id = ?`;
          query(sql, [this.maintenance.id]).then((res) => {
            if (res && res.length > 0) {
              const row = res[0];
              const m = row.mileage != null ? Number(row.mileage) : 0;
              const it = row.items != null ? String(row.items) : "";
              this.maintenance = {
                id: row.id,
                maintenanceDate: row.maintenanceDate || "",
                cost: row.cost != null ? row.cost : "",
                mileage: m !== 0 ? String(m) : "",
                items: it && it !== "无" ? it : ""
              };
              const carIndex = this.carList.findIndex((car) => car.id === row.carId);
              if (carIndex !== -1) {
                this.selectedCarIndex = carIndex;
                this.selectedCar = this.carList[carIndex];
              }
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:122", "加载保养信息失败:", err);
            this.maintenance = {
              id: this.maintenance.id,
              maintenanceDate: "2026-03-15",
              cost: 800,
              mileage: "10000",
              items: "机油更换"
            };
            this.selectedCar = this.carList[0];
          });
        } else {
          this.maintenance = {
            id: this.maintenance.id,
            maintenanceDate: "2026-03-15",
            cost: 800,
            mileage: "10000",
            items: "机油更换"
          };
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.maintenance.maintenanceDate = e.detail.value;
      },
      normalizeMileage(val) {
        if (val === "" || val === null || val === void 0)
          return 0;
        const n = parseInt(String(val).trim(), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      },
      normalizeItems(val) {
        const s = val == null ? "" : String(val).trim();
        return s === "" ? "无" : s;
      },
      updateMaintenance() {
        if (!this.selectedCar || !this.maintenance.maintenanceDate || this.maintenance.cost === "" || this.maintenance.cost === null) {
          uni.showToast({
            title: "请填写车名、时间与费用",
            icon: "none"
          });
          return;
        }
        const costNum = parseFloat(this.maintenance.cost);
        if (Number.isNaN(costNum) || costNum < 0) {
          uni.showToast({ title: "费用请输入有效数字", icon: "none" });
          return;
        }
        const mileage = this.normalizeMileage(this.maintenance.mileage);
        const items = this.normalizeItems(this.maintenance.items);
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `UPDATE maintenance SET carId = ?, carName = ?, maintenanceDate = ?, mileage = ?, cost = ?, items = ? WHERE id = ?`;
          const params = [
            this.selectedCar.id,
            this.selectedCar.name,
            this.maintenance.maintenanceDate,
            mileage,
            costNum,
            items,
            this.maintenance.id
          ];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "更新成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:197", "更新失败:", err);
            uni.showToast({
              title: "更新失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "更新成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$6(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "时间"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[1] || (_cache[1] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.maintenance.maintenanceDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.maintenance.maintenanceDate || "请选择日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "费用"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.maintenance.cost = $event),
              placeholder: "请输入费用（元）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.cost]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养里程（选填）"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.maintenance.mileage = $event),
              placeholder: "不填默认为 0",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.mileage]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养项目（选填）"),
          vue.withDirectives(vue.createElementVNode(
            "textarea",
            {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $data.maintenance.items = $event),
              placeholder: "不填默认为「无」",
              class: "textarea"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.items]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.updateMaintenance && $options.updateMaintenance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[6] || (_cache[6] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesMaintenanceEditMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["render", _sfc_render$6], ["__scopeId", "data-v-b25d45f2"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/edit-maintenance.vue"]]);
  const RENTAL_COLUMNS = [
    "id",
    "carId",
    "carName",
    "startDate",
    "endDate",
    "days",
    "dailyRate",
    "initialTotalAmount",
    "changeAmount",
    "changeAction",
    "changedTotalAmount",
    "renterName",
    "renterPhone",
    "status",
    "createdAt",
    "updatedAt"
  ];
  function backupFilenameStamp() {
    const d = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  function buildInsertRental(row) {
    const params = RENTAL_COLUMNS.map((col) => {
      if (col === "initialTotalAmount" && row.initialTotalAmount == null && row.totalAmount != null) {
        return row.totalAmount;
      }
      if (!(col in row) || row[col] === void 0) {
        return null;
      }
      return row[col];
    });
    const ph = RENTAL_COLUMNS.map(() => "?").join(", ");
    const sql = `INSERT INTO rental (${RENTAL_COLUMNS.join(", ")}) VALUES (${ph})`;
    return { sql, params };
  }
  function saveJsonToDevice(json, filename) {
    return new Promise((resolve, reject) => {
      let uniPlatform;
      try {
        uniPlatform = uni.getSystemInfoSync().uniPlatform;
      } catch (e) {
        uniPlatform = "";
      }
      if (uniPlatform === "web") {
        if (typeof document === "undefined") {
          reject(new Error("H5 无 document"));
          return;
        }
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve({
          filePath: filename,
          hint: "文件已由浏览器下载，请在下载文件夹中查看。"
        });
        return;
      }
      const fs = typeof uni.getFileSystemManager === "function" ? uni.getFileSystemManager() : null;
      if (fs) {
        const filePath = `_doc/${filename}`;
        fs.writeFile({
          filePath,
          data: json,
          encoding: "utf8",
          success: () => resolve({
            filePath,
            hint: "已保存到应用私有文档目录 _doc。Android 可通过连接电脑在应用数据目录中查找，或使用系统文件管理（视 ROM 而定）。"
          }),
          fail: (err) => reject(err || new Error("writeFile 失败"))
        });
        return;
      }
      reject(new Error("当前运行环境不支持文件导出"));
    });
  }
  function exportRentalBackup() {
    return query("SELECT * FROM rental ORDER BY id ASC").then((rows) => {
      const list = rows || [];
      const payload = {
        version: 1,
        table: "rental",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        rowCount: list.length,
        rows: list
      };
      const json = JSON.stringify(payload, null, 2);
      const filename = `rental_backup_${backupFilenameStamp()}.json`;
      return saveJsonToDevice(json, filename).then((info) => ({
        rowCount: list.length,
        filePath: info.filePath,
        hint: info.hint
      }));
    });
  }
  function pickAndReadJsonFile() {
    return new Promise((resolve, reject) => {
      let uniPlatform;
      try {
        uniPlatform = uni.getSystemInfoSync().uniPlatform;
      } catch (e) {
        uniPlatform = "";
      }
      if (uniPlatform === "web") {
        if (typeof document === "undefined") {
          reject(new Error("当前环境无法选择文件"));
          return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.cssText = "position:fixed;left:-100px;width:1px;height:1px;opacity:0;";
        input.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) {
            reject(new Error("未选择文件"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("读取文件失败"));
          reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => {
          try {
            document.body.removeChild(input);
          } catch (err) {
          }
        }, 500);
        return;
      }
      if (typeof uni.chooseFile === "function") {
        uni.chooseFile({
          count: 1,
          extension: [".json"],
          success: (res) => {
            const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].path || res.tempFilePaths && res.tempFilePaths[0];
            if (!path) {
              reject(new Error("无法获取文件路径"));
              return;
            }
            uni.getFileSystemManager().readFile({
              filePath: path,
              encoding: "utf8",
              success: (r) => {
                const txt = typeof r.data === "string" ? r.data : String(r.data);
                resolve(txt);
              },
              fail: (err) => reject(err || new Error("readFile 失败"))
            });
          },
          fail: (err) => {
            const msg = err && (err.errMsg || err.message);
            if (msg && String(msg).indexOf("cancel") !== -1) {
              reject(new Error("已取消"));
              return;
            }
            reject(err || new Error("未选择文件"));
          }
        });
        return;
      }
      reject(new Error("当前环境不支持选择文件，请在 App 或 H5 使用"));
    });
  }
  function importRentalBackup(jsonText) {
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (e) {
      return Promise.reject(new Error("不是有效的 JSON 文件"));
    }
    if (!payload || payload.table !== "rental" || !Array.isArray(payload.rows)) {
      return Promise.reject(new Error("不是本应用导出的租约备份（需包含 table: rental 与 rows 数组）"));
    }
    const rows = payload.rows;
    return executeSql("DELETE FROM rental").then(() => {
      if (rows.length === 0) {
        return { rowCount: 0 };
      }
      return rows.reduce((chain, row) => {
        const { sql, params } = buildInsertRental(row);
        return chain.then(() => executeSql(sql, params));
      }, Promise.resolve()).then(() => ({ rowCount: rows.length }));
    });
  }
  const _sfc_main$6 = {
    data() {
      return {
        rentalList: [],
        searchKeyword: "",
        statusOptions: ["全部", "进行中", "已完成"],
        selectedStatusIndex: 0,
        // 滑动操作相关状态
        startX: 0,
        endX: 0,
        currentId: 0,
        showSlideAction: false,
        slideDirection: "",
        slideId: 0
      };
    },
    onShow() {
      this.loadRentalList();
    },
    methods: {
      loadRentalList() {
        const sql = `SELECT * FROM rental ORDER BY id DESC`;
        query(sql).then((res) => {
          const rentals = (res || []).sort((a, b) => b.id - a.id);
          this.rentalList = rentals.map((item) => {
            if (item.totalAmount && !item.initialTotalAmount) {
              item.initialTotalAmount = item.totalAmount;
              delete item.totalAmount;
            }
            if (item.changeAmount && item.changeAmount < 0) {
              item.changeAmount = Math.abs(item.changeAmount);
            }
            return item;
          });
          if (this.rentalList.length === 0) {
            this.rentalList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                startDate: "2026-04-01",
                endDate: "2026-04-05",
                days: 5,
                dailyRate: 300,
                initialTotalAmount: 1500,
                status: "已完成"
              },
              {
                id: 2,
                carName: "本田雅阁",
                startDate: "2026-04-10",
                endDate: "2026-04-15",
                days: 6,
                dailyRate: 350,
                initialTotalAmount: 2100,
                changeAmount: 700,
                changeAction: "续租",
                changedTotalAmount: 2800,
                updatedAt: "2026-04-12",
                status: "进行中"
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/rental.vue:149", "加载租赁列表失败:", err);
          this.rentalList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              startDate: "2026-04-01",
              endDate: "2026-04-05",
              days: 5,
              dailyRate: 300,
              initialTotalAmount: 1500,
              status: "已完成"
            },
            {
              id: 2,
              carName: "本田雅阁",
              startDate: "2026-04-10",
              endDate: "2026-04-15",
              days: 6,
              dailyRate: 350,
              initialTotalAmount: 2100,
              changeAmount: 700,
              changeAction: "续租",
              changedTotalAmount: 2800,
              updatedAt: "2026-04-12",
              status: "进行中"
            }
          ];
        });
      },
      addRental() {
        uni.navigateTo({
          url: "./add-rental"
        });
      },
      onBackupTap() {
        uni.showActionSheet({
          itemList: ["导出租约备份", "导入租约备份"],
          success: (res) => {
            if (res.tapIndex === 0) {
              this.doExportRentalBackup();
            } else if (res.tapIndex === 1) {
              this.doImportRentalBackup();
            }
          }
        });
      },
      doExportRentalBackup() {
        uni.showLoading({ title: "导出中…", mask: true });
        exportRentalBackup().then((info) => {
          uni.hideLoading();
          const msg = `共 ${info.rowCount} 条租约
${info.filePath}

${info.hint || ""}`;
          uni.showModal({
            title: "租约已导出",
            content: msg,
            showCancel: false
          });
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/rental.vue:210", "导出租约失败:", err);
          uni.hideLoading();
          uni.showToast({
            title: err && err.message ? err.message : "导出失败",
            icon: "none",
            duration: 2500
          });
        });
      },
      doImportRentalBackup() {
        uni.showModal({
          title: "确认导入",
          content: "导入将清空当前所有租约，并以备份文件中的数据完全替换。是否继续？",
          success: (modalRes) => {
            if (!modalRes.confirm) {
              return;
            }
            pickAndReadJsonFile().then((text) => {
              uni.showLoading({ title: "导入中…", mask: true });
              return importRentalBackup(text);
            }).then((info) => {
              uni.hideLoading();
              this.loadRentalList();
              uni.showModal({
                title: "导入成功",
                content: `已写入 ${info.rowCount} 条租约`,
                showCancel: false
              });
            }).catch((err) => {
              formatAppLog("error", "at pages/rental/rental.vue:242", "导入租约失败:", err);
              uni.hideLoading();
              const msg = err && err.message ? err.message : "导入失败";
              if (msg === "已取消") {
                return;
              }
              uni.showToast({
                title: msg,
                icon: "none",
                duration: 2800
              });
            });
          }
        });
      },
      editRental(item) {
        uni.navigateTo({
          url: "./edit-rental?id=" + item.id
        });
      },
      deleteRental(id) {
        const rentalItem = this.rentalList.find((item) => item.id === id);
        if (!rentalItem)
          return;
        uni.showModal({
          title: "确认删除",
          content: "请输入此次总金额以确认删除",
          editable: true,
          placeholderText: "请输入总金额",
          success: (res) => {
            if (res.confirm) {
              const inputAmount = parseFloat(res.content);
              const totalAmount = rentalItem.changedTotalAmount || parseFloat(rentalItem.initialTotalAmount);
              if (inputAmount === totalAmount) {
                const sql = `DELETE FROM rental WHERE id = ?`;
                executeSql(sql, [id]).then(() => {
                  this.rentalList = this.rentalList.filter((item) => item.id !== id);
                  uni.showToast({
                    title: "删除成功",
                    icon: "success"
                  });
                }).catch((err) => {
                  formatAppLog("error", "at pages/rental/rental.vue:291", "删除失败:", err);
                  this.rentalList = this.rentalList.filter((item) => item.id !== id);
                  uni.showToast({
                    title: "删除成功",
                    icon: "success"
                  });
                });
              } else {
                uni.showToast({
                  title: "金额验证失败，删除取消",
                  icon: "error"
                });
              }
            }
          }
        });
      },
      formatDateToDay(dateString) {
        if (!dateString)
          return "";
        if (dateString.includes("T")) {
          return dateString.split("T")[0];
        }
        return dateString;
      },
      handleStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      handleSearch() {
      },
      // 续租功能
      renewRental(item) {
        uni.showModal({
          title: "续租",
          content: "请输入续租的金额变化",
          editable: true,
          placeholderText: "请输入金额",
          success: (res) => {
            if (res.confirm) {
              const changeAmount = parseFloat(res.content);
              if (isNaN(changeAmount) || changeAmount <= 0) {
                uni.showToast({
                  title: "输入格式错误，金额应为正数",
                  icon: "error"
                });
                return;
              }
              const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
              const newTotalAmount = baseAmount + changeAmount;
              const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
              const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
              const params = [changeAmount, "续租", newTotalAmount, updatedAt, item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].changeAmount = changeAmount;
                  this.rentalList[index].changeAction = "续租";
                  this.rentalList[index].changedTotalAmount = newTotalAmount;
                  this.rentalList[index].updatedAt = updatedAt;
                  delete this.rentalList[index].totalAmount;
                }
                uni.showToast({
                  title: "续租成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:366", "续租失败:", err);
                uni.showToast({
                  title: "续租失败",
                  icon: "error"
                });
              });
            }
          }
        });
      },
      // 退租功能
      returnRental(item) {
        uni.showModal({
          title: "退租",
          content: "请输入退租的金额变化",
          editable: true,
          placeholderText: "请输入金额",
          success: (res) => {
            if (res.confirm) {
              const changeAmount = parseFloat(res.content);
              if (isNaN(changeAmount) || changeAmount <= 0) {
                uni.showToast({
                  title: "输入格式错误，金额应为正数",
                  icon: "error"
                });
                return;
              }
              const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
              const newTotalAmount = baseAmount - changeAmount;
              const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
              const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
              const params = [changeAmount, "退租", newTotalAmount, updatedAt, item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].changeAmount = changeAmount;
                  this.rentalList[index].changeAction = "退租";
                  this.rentalList[index].changedTotalAmount = newTotalAmount;
                  this.rentalList[index].updatedAt = updatedAt;
                  delete this.rentalList[index].totalAmount;
                }
                uni.showToast({
                  title: "退租成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:419", "退租失败:", err);
                uni.showToast({
                  title: "退租失败",
                  icon: "error"
                });
              });
            }
          }
        });
      },
      // 一键完成租约
      completeRental(item) {
        uni.showModal({
          title: "确认完成",
          content: "确定要将此租约标记为已完成吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `UPDATE rental SET status = ? WHERE id = ?`;
              const params = ["已完成", item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].status = "已完成";
                }
                uni.showToast({
                  title: "租约已完成",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:450", "完成租约失败:", err);
                uni.showToast({
                  title: "完成租约失败",
                  icon: "error"
                });
              });
            }
          }
        });
      },
      // 滑动操作相关方法
      touchStart(e) {
        this.startX = e.touches[0].clientX;
        this.currentId = e.currentTarget.dataset.id;
      },
      touchMove(e) {
        this.endX = e.touches[0].clientX;
        const diff = this.startX - this.endX;
        if (diff > 50) {
          this.showSlideAction = true;
          this.slideDirection = "left";
          this.slideId = this.currentId;
        } else if (diff < -50) {
          this.showSlideAction = true;
          this.slideDirection = "right";
          this.slideId = this.currentId;
        } else {
          this.showSlideAction = false;
        }
      },
      // 点击其他地方关闭滑动状态
      closeSlideAction() {
        this.showSlideAction = false;
        this.slideId = 0;
      },
      touchEnd() {
        this.startX = 0;
        this.endX = 0;
      }
    },
    computed: {
      filteredRentalList() {
        let filtered = this.rentalList;
        if (this.searchKeyword) {
          const keyword = this.searchKeyword.toLowerCase();
          filtered = filtered.filter(
            (item) => item.carName.toLowerCase().includes(keyword)
          );
        }
        const selectedStatus = this.statusOptions[this.selectedStatusIndex];
        if (selectedStatus !== "全部") {
          filtered = filtered.filter((item) => item.status === selectedStatus);
        }
        return filtered;
      }
    }
  };
  function _sfc_render$5(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", {
      class: "container",
      onClick: _cache[8] || (_cache[8] = (...args) => $options.closeSlideAction && $options.closeSlideAction(...args))
    }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "搜索车辆名称",
              class: "search-input",
              "confirm-type": "search",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("view", {
          class: "header-export",
          onClick: _cache[2] || (_cache[2] = vue.withModifiers((...args) => $options.onBackupTap && $options.onBackupTap(...args), ["stop"]))
        }, "备份")
      ]),
      vue.createElementVNode("view", { class: "tab-section" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($data.statusOptions, (option, index) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: index,
              class: vue.normalizeClass(["tab-item", { active: $data.selectedStatusIndex === index }]),
              onClick: vue.withModifiers(($event) => $data.selectedStatusIndex = index, ["stop"])
            }, vue.toDisplayString(option), 11, ["onClick"]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", { class: "rental-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredRentalList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "rental-item"
            }, [
              vue.createElementVNode("view", { class: "rental-item-wrapper" }, [
                vue.createElementVNode("view", { class: "slide-actions-left" }, [
                  vue.createElementVNode("view", {
                    class: "slide-action edit-action",
                    onClick: vue.withModifiers(($event) => $options.editRental(item), ["stop"])
                  }, "编辑", 8, ["onClick"])
                ]),
                vue.createElementVNode("view", {
                  class: "item-content",
                  onTouchstart: _cache[3] || (_cache[3] = (...args) => $options.touchStart && $options.touchStart(...args)),
                  onTouchmove: _cache[4] || (_cache[4] = (...args) => $options.touchMove && $options.touchMove(...args)),
                  onTouchend: _cache[5] || (_cache[5] = (...args) => $options.touchEnd && $options.touchEnd(...args)),
                  onClick: _cache[6] || (_cache[6] = vue.withModifiers(() => {
                  }, ["stop"])),
                  "data-id": item.id,
                  style: vue.normalizeStyle({
                    transform: $data.showSlideAction && $data.slideId === item.id ? $data.slideDirection === "left" ? "translateX(-120rpx)" : "translateX(120rpx)" : "translateX(0)"
                  })
                }, [
                  vue.createElementVNode(
                    "text",
                    { class: "car-number" },
                    vue.toDisplayString(item.carName),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "rental-date" },
                    "租赁时间：" + vue.toDisplayString(item.startDate) + " 至 " + vue.toDisplayString(item.endDate),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "days" },
                    "租赁天数：" + vue.toDisplayString(item.days) + "天",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "daily-rate" },
                    "日租金：" + vue.toDisplayString(item.dailyRate) + "元",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("text", { class: "total-amount" }, [
                    vue.createTextVNode(
                      " 总金额：" + vue.toDisplayString(item.changedTotalAmount || item.initialTotalAmount || item.totalAmount) + "元 ",
                      1
                      /* TEXT */
                    ),
                    item.changeAction ? (vue.openBlock(), vue.createElementBlock(
                      "text",
                      {
                        key: 0,
                        class: "change-info"
                      },
                      " （" + vue.toDisplayString(item.changedTotalAmount || item.initialTotalAmount) + " " + vue.toDisplayString(item.changeAction) + " " + vue.toDisplayString(item.changeAmount) + " 于" + vue.toDisplayString($options.formatDateToDay(item.updatedAt)) + "） ",
                      1
                      /* TEXT */
                    )) : vue.createCommentVNode("v-if", true)
                  ]),
                  item.renterName || item.renterPhone ? (vue.openBlock(), vue.createElementBlock(
                    "text",
                    {
                      key: 0,
                      class: "renter-info"
                    },
                    " 租车人：" + vue.toDisplayString(item.renterName || "未填写") + " " + vue.toDisplayString(item.renterPhone ? "(" + item.renterPhone + ")" : ""),
                    1
                    /* TEXT */
                  )) : vue.createCommentVNode("v-if", true),
                  vue.createElementVNode(
                    "text",
                    {
                      class: vue.normalizeClass(["status", item.status === "已完成" ? "status-completed" : "status-active"])
                    },
                    " 状态：" + vue.toDisplayString(item.status),
                    3
                    /* TEXT, CLASS */
                  ),
                  vue.createElementVNode("view", { class: "item-actions" }, [
                    vue.createElementVNode("button", {
                      onClick: vue.withModifiers(($event) => $options.renewRental(item), ["stop"]),
                      class: "renew-btn"
                    }, "续租", 8, ["onClick"]),
                    vue.createElementVNode("button", {
                      onClick: vue.withModifiers(($event) => $options.returnRental(item), ["stop"]),
                      class: "return-btn"
                    }, "退租", 8, ["onClick"]),
                    item.status === "进行中" ? (vue.openBlock(), vue.createElementBlock("button", {
                      key: 0,
                      onClick: vue.withModifiers(($event) => $options.completeRental(item), ["stop"]),
                      class: "complete-btn"
                    }, "一键完成", 8, ["onClick"])) : vue.createCommentVNode("v-if", true)
                  ])
                ], 44, ["data-id"]),
                vue.createElementVNode("view", { class: "slide-actions-right" }, [
                  vue.createElementVNode("view", {
                    class: "slide-action delete-action",
                    onClick: vue.withModifiers(($event) => $options.deleteRental(item.id), ["stop"])
                  }, "删除", 8, ["onClick"])
                ])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", {
        class: "fab-add fab-add-rental",
        onClick: _cache[7] || (_cache[7] = vue.withModifiers((...args) => $options.addRental && $options.addRental(...args), ["stop"]))
      }, [
        vue.createElementVNode("text", { class: "fab-add-icon" }, "+")
      ])
    ]);
  }
  const PagesRentalRental = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["render", _sfc_render$5], ["__scopeId", "data-v-c7393d3c"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/rental.vue"]]);
  const _sfc_main$5 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        rental: {
          startDate: "",
          endDate: "",
          days: "",
          dailyRate: "",
          initialTotalAmount: "",
          renterName: "",
          renterPhone: ""
        },
        autoCalculate: true,
        statusOptions: ["进行中", "已完成"],
        selectedStatusIndex: 0
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car`;
        query(sql).then((res) => {
          this.carList = res || [];
          if (this.carList.length > 0) {
            this.selectedCar = this.carList[0];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/add-rental.vue:124", "加载车辆列表失败:", err);
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        });
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onStartDateChange(e) {
        this.startDate = e.detail.value;
        this.updateStartDateTime();
      },
      onStartTimeChange(e) {
        this.startTime = e.detail.value;
        this.updateStartDateTime();
      },
      onEndDateChange(e) {
        this.endDate = e.detail.value;
        this.updateEndDateTime();
      },
      onEndTimeChange(e) {
        this.endTime = e.detail.value;
        this.updateEndDateTime();
      },
      updateStartDateTime() {
        if (this.startDate && this.startTime) {
          this.rental.startDate = this.startDate + " " + this.startTime;
          this.calculateDays();
        }
      },
      updateEndDateTime() {
        if (this.endDate && this.endTime) {
          this.rental.endDate = this.endDate + " " + this.endTime;
          this.calculateDays();
        }
      },
      calculateDays() {
        if (this.rental.startDate && this.rental.endDate) {
          const start = new Date(this.rental.startDate);
          const end = new Date(this.rental.endDate);
          const diffTime = end - start;
          const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
          this.rental.days = diffDays > 0 ? diffDays : 1;
          this.calculateTotal();
        } else {
          this.rental.days = "";
        }
      },
      onDailyRateChange() {
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      calculateTotal() {
        if (this.autoCalculate && this.rental.days && this.rental.dailyRate) {
          const days = parseFloat(this.rental.days);
          const dailyRate = parseFloat(this.rental.dailyRate);
          this.rental.initialTotalAmount = (days * dailyRate).toFixed(2);
        }
      },
      onAutoCalculateChange(e) {
        this.autoCalculate = e.detail.value;
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      onStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      saveRental() {
        if (!this.selectedCar || !this.rental.startDate || !this.rental.endDate || !this.rental.days || !this.rental.dailyRate || !this.rental.initialTotalAmount) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        const sql = `INSERT INTO rental (carId, carName, startDate, endDate, days, dailyRate, initialTotalAmount, renterName, renterPhone, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          this.selectedCar.id,
          this.selectedCar.name,
          this.rental.startDate,
          this.rental.endDate,
          this.rental.days,
          this.rental.dailyRate,
          this.rental.initialTotalAmount,
          this.rental.renterName,
          this.rental.renterPhone,
          this.statusOptions[this.selectedStatusIndex],
          (/* @__PURE__ */ new Date()).toISOString()
        ];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "保存成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/add-rental.vue:238", "保存失败:", err);
          uni.showToast({
            title: "保存失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$4(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "开始时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onStartDateChange && $options.onStartDateChange(...args)),
              value: $data.startDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.startDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[2] || (_cache[2] = (...args) => $options.onStartTimeChange && $options.onStartTimeChange(...args)),
              value: $data.startTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.startTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "结束时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[3] || (_cache[3] = (...args) => $options.onEndDateChange && $options.onEndDateChange(...args)),
              value: $data.endDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.endDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[4] || (_cache[4] = (...args) => $options.onEndTimeChange && $options.onEndTimeChange(...args)),
              value: $data.endTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.endTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租赁天数"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $data.rental.days = $event),
              placeholder: "自动计算",
              class: "input",
              disabled: ""
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.days]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "日租金"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "digit",
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $data.rental.dailyRate = $event),
              placeholder: "请输入日租金",
              class: "input",
              onInput: _cache[7] || (_cache[7] = (...args) => $options.onDailyRateChange && $options.onDailyRateChange(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.dailyRate]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("view", { class: "label-row" }, [
            vue.createElementVNode("text", { class: "label" }, "总金额"),
            vue.createElementVNode("switch", {
              checked: $data.autoCalculate,
              onChange: _cache[8] || (_cache[8] = (...args) => $options.onAutoCalculateChange && $options.onAutoCalculateChange(...args)),
              color: "#007AFF"
            }, null, 40, ["checked"]),
            vue.createElementVNode(
              "text",
              { class: "switch-label" },
              vue.toDisplayString($data.autoCalculate ? "自动计算" : "手动输入"),
              1
              /* TEXT */
            )
          ]),
          vue.withDirectives(vue.createElementVNode("input", {
            type: "digit",
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => $data.rental.initialTotalAmount = $event),
            placeholder: "请输入总金额",
            class: "input",
            disabled: $data.autoCalculate
          }, null, 8, ["disabled"]), [
            [vue.vModelText, $data.rental.initialTotalAmount]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人姓名"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => $data.rental.renterName = $event),
              placeholder: "请输入租车人姓名（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterName]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人电话"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => $data.rental.renterPhone = $event),
              placeholder: "请输入租车人电话（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterPhone]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "状态"),
          vue.createElementVNode("picker", {
            range: $data.statusOptions,
            onChange: _cache[12] || (_cache[12] = (...args) => $options.onStatusChange && $options.onStatusChange(...args)),
            value: $data.selectedStatusIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.statusOptions[$data.selectedStatusIndex]),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[13] || (_cache[13] = (...args) => $options.saveRental && $options.saveRental(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[14] || (_cache[14] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesRentalAddRental = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$4], ["__scopeId", "data-v-4d28a5ee"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/add-rental.vue"]]);
  const _sfc_main$4 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        rental: {
          id: "",
          startDate: "",
          endDate: "",
          days: "",
          dailyRate: "",
          initialTotalAmount: "",
          renterName: "",
          renterPhone: "",
          status: ""
        },
        autoCalculate: true,
        statusOptions: ["进行中", "已完成"],
        selectedStatusIndex: 0
      };
    },
    onLoad(options) {
      this.rental.id = parseInt(options.id);
      this.loadCarList();
      this.loadRentalInfo();
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car`;
        query(sql).then((res) => {
          this.carList = res || [];
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:125", "加载车辆列表失败:", err);
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        });
      },
      loadRentalInfo() {
        const sql = `SELECT * FROM rental WHERE id = ?`;
        query(sql, [this.rental.id]).then((res) => {
          if (res && res.length > 0) {
            this.rental = res[0];
            if (this.rental.startDate) {
              const startParts = this.rental.startDate.split(" ");
              if (startParts.length === 2) {
                this.startDate = startParts[0];
                this.startTime = startParts[1];
              }
            }
            if (this.rental.endDate) {
              const endParts = this.rental.endDate.split(" ");
              if (endParts.length === 2) {
                this.endDate = endParts[0];
                this.endTime = endParts[1];
              }
            }
            const carIndex = this.carList.findIndex((car) => car.id === this.rental.carId);
            if (carIndex !== -1) {
              this.selectedCarIndex = carIndex;
              this.selectedCar = this.carList[carIndex];
            }
            this.selectedStatusIndex = this.statusOptions.indexOf(this.rental.status);
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:170", "加载租赁信息失败:", err);
          this.rental = {
            id: this.rental.id,
            startDate: "2026-04-01 08:00",
            endDate: "2026-04-05 18:00",
            days: 5,
            dailyRate: 300,
            initialTotalAmount: 1500,
            renterName: "张三",
            renterPhone: "13800138000",
            status: "已完成"
          };
          this.startDate = "2026-04-01";
          this.startTime = "08:00";
          this.endDate = "2026-04-05";
          this.endTime = "18:00";
          this.selectedCar = this.carList[0];
          this.selectedStatusIndex = this.statusOptions.indexOf(this.rental.status);
        });
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onStartDateChange(e) {
        this.startDate = e.detail.value;
        this.updateStartDateTime();
      },
      onStartTimeChange(e) {
        this.startTime = e.detail.value;
        this.updateStartDateTime();
      },
      onEndDateChange(e) {
        this.endDate = e.detail.value;
        this.updateEndDateTime();
      },
      onEndTimeChange(e) {
        this.endTime = e.detail.value;
        this.updateEndDateTime();
      },
      updateStartDateTime() {
        if (this.startDate && this.startTime) {
          this.rental.startDate = this.startDate + " " + this.startTime;
          this.calculateDays();
        }
      },
      updateEndDateTime() {
        if (this.endDate && this.endTime) {
          this.rental.endDate = this.endDate + " " + this.endTime;
          this.calculateDays();
        }
      },
      calculateDays() {
        if (this.rental.startDate && this.rental.endDate) {
          const start = new Date(this.rental.startDate);
          const end = new Date(this.rental.endDate);
          const diffTime = end - start;
          const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
          this.rental.days = diffDays > 0 ? diffDays : 1;
          this.calculateTotal();
        } else {
          this.rental.days = "";
        }
      },
      onDailyRateChange() {
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      calculateTotal() {
        if (this.autoCalculate && this.rental.days && this.rental.dailyRate) {
          const days = parseFloat(this.rental.days);
          const dailyRate = parseFloat(this.rental.dailyRate);
          this.rental.initialTotalAmount = (days * dailyRate).toFixed(2);
        }
      },
      onAutoCalculateChange(e) {
        this.autoCalculate = e.detail.value;
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      onStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      updateRental() {
        if (!this.selectedCar || !this.rental.startDate || !this.rental.endDate || !this.rental.days || !this.rental.dailyRate || !this.rental.initialTotalAmount) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        const sql = `UPDATE rental SET carId = ?, carName = ?, startDate = ?, endDate = ?, days = ?, dailyRate = ?, initialTotalAmount = ?, renterName = ?, renterPhone = ?, status = ? WHERE id = ?`;
        const params = [
          this.selectedCar.id,
          this.selectedCar.name,
          this.rental.startDate,
          this.rental.endDate,
          this.rental.days,
          this.rental.dailyRate,
          this.rental.initialTotalAmount,
          this.rental.renterName,
          this.rental.renterPhone,
          this.statusOptions[this.selectedStatusIndex],
          this.rental.id
        ];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "更新成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:291", "更新失败:", err);
          uni.showToast({
            title: "更新失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$3(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "开始时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onStartDateChange && $options.onStartDateChange(...args)),
              value: $data.startDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.startDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[2] || (_cache[2] = (...args) => $options.onStartTimeChange && $options.onStartTimeChange(...args)),
              value: $data.startTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.startTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "结束时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[3] || (_cache[3] = (...args) => $options.onEndDateChange && $options.onEndDateChange(...args)),
              value: $data.endDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.endDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[4] || (_cache[4] = (...args) => $options.onEndTimeChange && $options.onEndTimeChange(...args)),
              value: $data.endTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.endTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租赁天数"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $data.rental.days = $event),
              placeholder: "自动计算",
              class: "input",
              disabled: ""
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.days]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "日租金"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "digit",
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $data.rental.dailyRate = $event),
              placeholder: "请输入日租金",
              class: "input",
              onInput: _cache[7] || (_cache[7] = (...args) => $options.onDailyRateChange && $options.onDailyRateChange(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.dailyRate]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("view", { class: "label-row" }, [
            vue.createElementVNode("text", { class: "label" }, "总金额"),
            vue.createElementVNode("switch", {
              checked: $data.autoCalculate,
              onChange: _cache[8] || (_cache[8] = (...args) => $options.onAutoCalculateChange && $options.onAutoCalculateChange(...args)),
              color: "#007AFF"
            }, null, 40, ["checked"]),
            vue.createElementVNode(
              "text",
              { class: "switch-label" },
              vue.toDisplayString($data.autoCalculate ? "自动计算" : "手动输入"),
              1
              /* TEXT */
            )
          ]),
          vue.withDirectives(vue.createElementVNode("input", {
            type: "digit",
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => $data.rental.initialTotalAmount = $event),
            placeholder: "请输入总金额",
            class: "input",
            disabled: $data.autoCalculate
          }, null, 8, ["disabled"]), [
            [vue.vModelText, $data.rental.initialTotalAmount]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人姓名"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => $data.rental.renterName = $event),
              placeholder: "请输入租车人姓名（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterName]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人电话"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => $data.rental.renterPhone = $event),
              placeholder: "请输入租车人电话（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterPhone]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "状态"),
          vue.createElementVNode("picker", {
            range: $data.statusOptions,
            onChange: _cache[12] || (_cache[12] = (...args) => $options.onStatusChange && $options.onStatusChange(...args)),
            value: $data.selectedStatusIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.statusOptions[$data.selectedStatusIndex]),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[13] || (_cache[13] = (...args) => $options.updateRental && $options.updateRental(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[14] || (_cache[14] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesRentalEditRental = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$3], ["__scopeId", "data-v-2d0021ad"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/edit-rental.vue"]]);
  function currentYearMonth() {
    const d = /* @__PURE__ */ new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  const _sfc_main$3 = {
    data() {
      const ym = currentYearMonth();
      const y = String((/* @__PURE__ */ new Date()).getFullYear());
      return {
        // uni-app 部分端对 date picker 的 start/end 要求为字符串日期，避免默认成 Number 触发 Vue 校验告警
        pickerDateStart: "1926-01-01",
        pickerDateEnd: "2126-12-31",
        selectedDate: ym,
        carStatsMonth: ym,
        monthlyStatsYear: y,
        monthlyIncome: 0,
        yearlyIncome: 0,
        totalIncome: 0,
        monthlyData: [],
        carData: [],
        // 首次加载是否已自动定位到最近有租约的月份（之后尊重用户手动选择）
        hasAutoPickedMonth: false
      };
    },
    computed: {
      monthlyStatsYearPickerValue() {
        return `${this.monthlyStatsYear}-01-01`;
      }
    },
    onShow() {
      this.refreshAll();
    },
    methods: {
      onDateChange(e) {
        this.selectedDate = e.detail.value;
        this.refreshAll();
      },
      onCarStatsMonthChange(e) {
        this.carStatsMonth = e.detail.value;
        this.refreshAll();
      },
      onMonthlyStatsYearChange(e) {
        const v = e.detail.value || "";
        this.monthlyStatsYear = v.length >= 4 ? v.substring(0, 4) : String((/* @__PURE__ */ new Date()).getFullYear());
        this.refreshAll();
      },
      /** 租约实际金额：优先变化后的总金额，其次初始金额，兼容历史 totalAmount */
      rentalAmount(row) {
        let v = row.changedTotalAmount;
        if (v == null)
          v = row.initialTotalAmount;
        if (v == null)
          v = row.totalAmount;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      },
      /** 只读一次 rental 全表，在内存中一次性汇总月/年/总/车名维度。 */
      refreshAll() {
        Promise.all([
          query("SELECT * FROM rental"),
          query("SELECT * FROM car")
        ]).then(([rentalRows, carRows]) => {
          this.computeAll(rentalRows || [], carRows || []);
        }).catch((err) => {
          formatAppLog("warn", "at pages/statistics/statistics.vue:170", "加载统计数据失败:", err);
          this.computeAll([], []);
        });
      },
      computeAll(list, carRows) {
        const carNameById = {};
        (carRows || []).forEach((car) => {
          carNameById[car.id] = car.name;
        });
        if (!this.hasAutoPickedMonth && list.length > 0) {
          let latest = "";
          list.forEach((row) => {
            const sd = row.startDate || "";
            if (sd > latest)
              latest = sd;
          });
          if (latest.length >= 7) {
            this.selectedDate = latest.substring(0, 7);
            this.carStatsMonth = this.selectedDate;
            this.monthlyStatsYear = latest.substring(0, 4);
          }
        }
        this.hasAutoPickedMonth = true;
        const monthKey = this.selectedDate || "";
        const yearKey = monthKey.substring(0, 4);
        const yearOfMonthlyStats = String(this.monthlyStatsYear || "");
        const carMonthKey = this.carStatsMonth || "";
        const carYearKey = carMonthKey.substring(0, 4);
        let monthly = 0;
        let yearly = 0;
        let total = 0;
        const monthBuckets = {};
        const carMonthMap = {};
        const carYearMap = {};
        const carKeyName = {};
        list.forEach((row) => {
          const amt = this.rentalAmount(row);
          const startDate = row.startDate || "";
          const rowMonth = startDate.substring(0, 7);
          const rowYear = startDate.substring(0, 4);
          total += amt;
          if (rowMonth === monthKey) {
            monthly += amt;
          }
          if (yearKey && rowYear === yearKey) {
            yearly += amt;
          }
          if (yearOfMonthlyStats && rowYear === yearOfMonthlyStats) {
            monthBuckets[rowMonth] = (monthBuckets[rowMonth] || 0) + amt;
          }
          const carKey = row.carId != null ? "id:" + row.carId : "name:" + (row.carName || "未命名");
          carKeyName[carKey] = carNameById[row.carId] || row.carName || "未命名";
          if (rowMonth === carMonthKey) {
            carMonthMap[carKey] = (carMonthMap[carKey] || 0) + amt;
          }
          if (carYearKey && rowYear === carYearKey) {
            carYearMap[carKey] = (carYearMap[carKey] || 0) + amt;
          }
        });
        this.monthlyIncome = monthly.toFixed(2);
        this.yearlyIncome = yearly.toFixed(2);
        this.totalIncome = total.toFixed(2);
        this.monthlyData = Object.keys(monthBuckets).sort().map((m) => ({ month: m, income: monthBuckets[m].toFixed(2) }));
        this.carData = Object.keys(carKeyName).map((carKey) => ({
          key: carKey,
          carName: carKeyName[carKey],
          monthIncome: (carMonthMap[carKey] || 0).toFixed(2),
          yearIncome: (carYearMap[carKey] || 0).toFixed(2)
        })).sort((a, b) => parseFloat(b.monthIncome) - parseFloat(a.monthIncome));
      }
    }
  };
  function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("text", { class: "title" }, "统计报表"),
        vue.createElementVNode("view", { class: "date-selector" }, [
          vue.createElementVNode("picker", {
            mode: "date",
            fields: "month",
            value: $data.selectedDate,
            start: $data.pickerDateStart,
            end: $data.pickerDateEnd,
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onDateChange && $options.onDateChange(...args))
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.selectedDate),
              1
              /* TEXT */
            )
          ], 40, ["value", "start", "end"])
        ])
      ]),
      vue.createElementVNode("view", { class: "stats-card" }, [
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "月度租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.monthlyIncome) + "元",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "年度租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.yearlyIncome) + "元",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "总租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.totalIncome) + "元",
            1
            /* TEXT */
          )
        ])
      ]),
      vue.createElementVNode("view", { class: "table-section" }, [
        vue.createElementVNode("view", { class: "section-head" }, [
          vue.createElementVNode("text", { class: "section-title" }, "按月收入统计"),
          vue.createElementVNode("view", { class: "car-month-filter" }, [
            vue.createElementVNode("text", { class: "filter-label" }, "年份"),
            vue.createElementVNode("picker", {
              mode: "date",
              fields: "year",
              value: $options.monthlyStatsYearPickerValue,
              start: $data.pickerDateStart,
              end: $data.pickerDateEnd,
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onMonthlyStatsYearChange && $options.onMonthlyStatsYearChange(...args))
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker car-month-picker" },
                vue.toDisplayString($data.monthlyStatsYear) + "年",
                1
                /* TEXT */
              )
            ], 40, ["value", "start", "end"])
          ])
        ]),
        vue.createElementVNode("text", { class: "section-hint" }, "仅展示所选年份内各月收入；默认当前年份，可切换查看往年。"),
        vue.createElementVNode("view", { class: "table-container" }, [
          vue.createElementVNode("view", { class: "table-header" }, [
            vue.createElementVNode("view", { class: "table-cell" }, "月份"),
            vue.createElementVNode("view", { class: "table-cell" }, "收入(元)")
          ]),
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.monthlyData, (item) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: item.month,
                class: "table-row"
              }, [
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.month),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.income),
                  1
                  /* TEXT */
                )
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          )),
          $data.monthlyData.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "table-empty"
          }, "该年暂无租赁收入数据")) : vue.createCommentVNode("v-if", true)
        ])
      ]),
      vue.createElementVNode("view", { class: "table-section" }, [
        vue.createElementVNode("view", { class: "section-head" }, [
          vue.createElementVNode("text", { class: "section-title" }, "按车名统计"),
          vue.createElementVNode("view", { class: "car-month-filter" }, [
            vue.createElementVNode("text", { class: "filter-label" }, "月收入月份"),
            vue.createElementVNode("picker", {
              mode: "date",
              fields: "month",
              value: $data.carStatsMonth,
              start: $data.pickerDateStart,
              end: $data.pickerDateEnd,
              onChange: _cache[2] || (_cache[2] = (...args) => $options.onCarStatsMonthChange && $options.onCarStatsMonthChange(...args))
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker car-month-picker" },
                vue.toDisplayString($data.carStatsMonth),
                1
                /* TEXT */
              )
            ], 40, ["value", "start", "end"])
          ])
        ]),
        vue.createElementVNode("text", { class: "section-hint" }, "年收入为「所选月份」所在自然年的累计（例：选 2026-05 则年收入为 2026 全年）。"),
        vue.createElementVNode("view", { class: "table-container" }, [
          vue.createElementVNode("view", { class: "table-header table-header-3" }, [
            vue.createElementVNode("view", { class: "table-cell table-cell-wide" }, "车名"),
            vue.createElementVNode("view", { class: "table-cell" }, "月收入(元)"),
            vue.createElementVNode("view", { class: "table-cell" }, "年收入(元)")
          ]),
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.carData, (item) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: item.key,
                class: "table-row table-header-3"
              }, [
                vue.createElementVNode(
                  "view",
                  { class: "table-cell table-cell-wide" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.monthIncome),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.yearIncome),
                  1
                  /* TEXT */
                )
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          )),
          $data.carData.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "table-empty"
          }, "暂无车辆租赁数据")) : vue.createCommentVNode("v-if", true)
        ])
      ])
    ]);
  }
  const PagesStatisticsStatistics = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2], ["__scopeId", "data-v-fc23ec97"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/statistics/statistics.vue"]]);
  const _sfc_main$2 = {
    data() {
      return {
        summary: "读取中…"
      };
    },
    onShow() {
      this.loadSummary();
    },
    methods: {
      loadSummary() {
        Promise.all([
          query("SELECT COUNT(*) as c FROM car"),
          query("SELECT COUNT(*) as c FROM rental")
        ]).then(([carRes, rentalRes]) => {
          const carCount = carRes && carRes[0] ? carRes[0].c : 0;
          const rentalCount = rentalRes && rentalRes[0] ? rentalRes[0].c : 0;
          this.summary = "车辆 " + carCount + " 辆，租约 " + rentalCount + " 条";
        }).catch(() => {
          this.summary = "读取失败";
        });
      },
      doExport() {
        uni.showLoading({ title: "导出中", mask: true });
        exportDbToDownload().then((fileName) => {
          uni.hideLoading();
          uni.showModal({
            title: "导出成功",
            content: "已保存到手机 Download 目录：\n" + fileName,
            showCancel: false
          });
        }).catch((err) => {
          uni.hideLoading();
          uni.showModal({
            title: "导出失败",
            content: String(err && err.message || err),
            showCancel: false
          });
        });
      },
      goImport() {
        uni.navigateTo({ url: "./import-db" });
      }
    }
  };
  function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "card" }, [
        vue.createElementVNode("text", { class: "title" }, "导出数据库"),
        vue.createElementVNode("text", { class: "desc" }, "把当前数据库另存到手机 Download 目录，文件名带日期。换手机或重装 App 时用它恢复。"),
        vue.createElementVNode("button", {
          class: "action-btn primary",
          onClick: _cache[0] || (_cache[0] = (...args) => $options.doExport && $options.doExport(...args))
        }, "导出到 Download")
      ]),
      vue.createElementVNode("view", { class: "card" }, [
        vue.createElementVNode("text", { class: "title" }, "导入数据库"),
        vue.createElementVNode("text", { class: "desc" }, "从系统文件选择器挑一个 .db 文件，App 会用其替换当前数据库。导入前建议先导出一份。"),
        vue.createElementVNode("button", {
          class: "action-btn",
          onClick: _cache[1] || (_cache[1] = (...args) => $options.goImport && $options.goImport(...args))
        }, "选择 .db 文件")
      ]),
      vue.createElementVNode("view", { class: "card" }, [
        vue.createElementVNode("text", { class: "title" }, "当前数据"),
        vue.createElementVNode(
          "text",
          { class: "desc" },
          vue.toDisplayString($data.summary),
          1
          /* TEXT */
        )
      ])
    ]);
  }
  const PagesDataData = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1], ["__scopeId", "data-v-98b81aa6"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/data/data.vue"]]);
  const _sfc_main$1 = {
    data() {
      return {
        pageUrl: "/static/db-import.html",
        chunks: {},
        total: 0,
        importing: false
      };
    },
    methods: {
      /** web-view 里选完文件后，H5 分片 postMessage 过来 */
      onMessage(e) {
        if (this.importing) {
          return;
        }
        const list = e.detail && e.detail.data || [];
        list.forEach((msg) => {
          if (!msg || msg.type !== "db-chunk") {
            return;
          }
          this.chunks[msg.seq] = msg.data;
          this.total = msg.total || 0;
        });
        if (this.total > 0 && Object.keys(this.chunks).length >= this.total) {
          this.writeChunks();
        }
      },
      writeChunks() {
        this.importing = true;
        const keys = Object.keys(this.chunks).sort((a, b) => Number(a) - Number(b));
        const base64 = keys.map((k) => this.chunks[k]).join("");
        this.chunks = {};
        this.total = 0;
        uni.showLoading({ title: "导入中", mask: true });
        importDbFromBase64(base64).then(() => {
          uni.hideLoading();
          uni.showModal({
            title: "导入成功",
            content: "数据库已替换，请核对车辆与租约数据。",
            showCancel: false,
            success: () => {
              uni.reLaunch({ url: "/pages/index/index" });
            }
          });
        }).catch((err) => {
          uni.hideLoading();
          this.importing = false;
          uni.showModal({
            title: "导入失败",
            content: String(err && err.message || err),
            showCancel: false
          });
        });
      }
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("web-view", {
      src: $data.pageUrl,
      onMessage: _cache[0] || (_cache[0] = (...args) => $options.onMessage && $options.onMessage(...args))
    }, null, 40, ["src"]);
  }
  const PagesDataImportDb = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/data/import-db.vue"]]);
  __definePage("pages/index/index", PagesIndexIndex);
  __definePage("pages/index/add-car", PagesIndexAddCar);
  __definePage("pages/index/edit-car", PagesIndexEditCar);
  __definePage("pages/insurance/insurance", PagesInsuranceInsurance);
  __definePage("pages/insurance/add-insurance", PagesInsuranceAddInsurance);
  __definePage("pages/insurance/edit-insurance", PagesInsuranceEditInsurance);
  __definePage("pages/maintenance/maintenance", PagesMaintenanceMaintenance);
  __definePage("pages/maintenance/add-maintenance", PagesMaintenanceAddMaintenance);
  __definePage("pages/maintenance/edit-maintenance", PagesMaintenanceEditMaintenance);
  __definePage("pages/rental/rental", PagesRentalRental);
  __definePage("pages/rental/add-rental", PagesRentalAddRental);
  __definePage("pages/rental/edit-rental", PagesRentalEditRental);
  __definePage("pages/statistics/statistics", PagesStatisticsStatistics);
  __definePage("pages/data/data", PagesDataData);
  __definePage("pages/data/import-db", PagesDataImportDb);
  const _sfc_main = {
    onLaunch: function() {
      formatAppLog("log", "at App.vue:5", "App Launch");
      this.initDatabase();
    },
    onShow: function() {
      formatAppLog("log", "at App.vue:10", "App Show");
    },
    onHide: function() {
      formatAppLog("log", "at App.vue:13", "App Hide");
    },
    methods: {
      initDatabase() {
        initDb().then(() => {
          formatAppLog("log", "at App.vue:21", "数据库初始化成功，存储后端:", hasPlusSqlite() ? "SQLite" : "IndexedDB");
        }).catch((err) => {
          formatAppLog("warn", "at App.vue:23", "数据库初始化失败:", err);
          const msg = err && (err.message || err.msg) ? String(err.message || err.msg) : String(err);
          uni.showModal({
            title: "数据库初始化失败",
            content: msg + "\n\n可在「数据管理」页重新导入数据库，或把 car_management.db 复制到手机「Download」目录后点【重试】。",
            confirmText: "重试",
            success: (res) => {
              if (res.confirm) {
                this.initDatabase();
              }
            }
          });
        });
      }
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/App.vue"]]);
  function createApp() {
    const app = vue.createVueApp(App);
    return {
      app
    };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);

// 数据库管理模块
const dbName = 'car_management';
// IndexedDB 结构版本：2 起为 rental/maintenance/insurance 建立索引，避免全表扫描
const dbVersion = 2;
let db = null;
let indexedDb = null;
// 初始化 Promise 缓存：页面可能早于 App.vue 的 initDb 完成就发起查询
let initPromise = null;

/** 手机公共 Download 目录 / App 私有下载目录中预先放好的库文件（按顺序尝试） */
const DB_DOWNLOAD_CANDIDATES = [
	'/storage/emulated/0/Download/car_management.db',
	'file:///storage/emulated/0/Download/car_management.db',
	'_downloads/car_management.db'
];
// 记录已导入文件的指纹（路径+大小+修改时间），避免每次启动都覆盖 App 内新增的数据
const DB_IMPORT_MARK_KEY = 'db_imported_mark';

/** 5+ 官方为 openDatabase / closeDatabase，无 open / close */
export function hasPlusSqlite() {
	return (
		typeof plus !== 'undefined' &&
		plus.sqlite &&
		typeof plus.sqlite.openDatabase === 'function' &&
		typeof plus.sqlite.executeSql === 'function' &&
		typeof plus.sqlite.selectSql === 'function'
	);
}

/** 是否在运行时走 IndexedDB（H5/小程序等无可用 plus.sqlite 的环境） */
function useIndexedDbStorage() {
	return !hasPlusSqlite();
}

/** HTML5+ 的 executeSql/selectSql 无 params 数组，将 ? 按序替换为安全字面量 */
function bindPlusSqlParams(sql, params) {
	if (!params || params.length === 0) {
		return sql;
	}
	let i = 0;
	return sql.replace(/\?/g, () => {
		const v = params[i++];
		if (v === null || v === undefined) {
			return 'NULL';
		}
		if (typeof v === 'number' && Number.isFinite(v)) {
			return String(v);
		}
		return "'" + String(v).replace(/'/g, "''") + "'";
	});
}

// 初始化数据库
// skipImport=true 时不跑「包内 static / Download」导入，用于刚手工导入库之后避免被覆盖
export function initDb(skipImport = false) {
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
				// 首次启动时从手机 Download 目录导入外部库（之后由 App 自己读写 _doc）
				// 外部写入的文件属主不对，SQLite 会报 -1404，所以必须由 App 自己复制一份
				importDbFrom(DB_DOWNLOAD_CANDIDATES)
					.then((res) => {
						if (res && res.installed) {
							console.log('已导入数据库:', res.source);
						}
					})
					.then(() => initPlusSqlite())
					.then(resolve)
					.catch(reject);
			} else {
				initIndexedDB().then(resolve).catch(reject);
			}
		};

		// #ifdef APP-PLUS
		if (typeof plus !== 'undefined') {
			runInit();
		} else if (typeof document !== 'undefined') {
			document.addEventListener('plusready', runInit, { once: true });
		} else {
			runInit();
		}
		// #endif
		// #ifndef APP-PLUS
		runInit();
		// #endif
	});
	// 初始化失败时清空缓存，允许后续重试
	initPromise.catch(() => {
		initPromise = null;
	});
	return initPromise;
}

/** 查询前确保数据库已就绪（等待 initDb 完成，避免首屏查询撞上「数据库未初始化」） */
function waitForDb() {
	if (db) {
		return Promise.resolve();
	}
	if (initPromise) {
		return initPromise.then(() => {
			if (!db) {
				throw '数据库未初始化';
			}
		});
	}
	return Promise.reject('数据库未初始化');
}

// 初始化IndexedDB（浏览器环境）
function initIndexedDB() {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject('当前环境不支持IndexedDB');
			return;
		}
		if (indexedDb) {
			resolve();
			return;
		}
		const request = indexedDB.open(dbName, dbVersion);

		request.onerror = function (event) {
			reject('IndexedDB打开失败: ' + event.target.error);
		};

		request.onsuccess = function (event) {
			indexedDb = event.target.result;
			db = dbName;
			resolve();
		};

		request.onupgradeneeded = function (event) {
			const idb = event.target.result;
			const upgradeTx = event.target.transaction;

			// 创建或复用表（老库升级时表已存在，直接取用）
			const ensureStore = (name) => {
				if (!idb.objectStoreNames.contains(name)) {
					return idb.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
				}
				return upgradeTx.objectStore(name);
			};
			// 建索引（已存在则跳过），让 carId / 日期类查询走索引而不是 getAll()
			const ensureIndex = (store, indexName, keyPath) => {
				if (store && !store.indexNames.contains(indexName)) {
					store.createIndex(indexName, keyPath, { unique: false });
				}
			};

			ensureIndex(ensureStore('car'), 'name', 'name');

			const insuranceStore = ensureStore('insurance');
			ensureIndex(insuranceStore, 'carId', 'carId');
			ensureIndex(insuranceStore, 'expireDate', 'expireDate');

			const maintenanceStore = ensureStore('maintenance');
			ensureIndex(maintenanceStore, 'carId', 'carId');
			ensureIndex(maintenanceStore, 'maintenanceDate', 'maintenanceDate');

			const rentalStore = ensureStore('rental');
			ensureIndex(rentalStore, 'carId', 'carId');
			ensureIndex(rentalStore, 'carName', 'carName');
			ensureIndex(rentalStore, 'startDate', 'startDate');

			ensureStore('statistics_config');
		};
	});
}

// 初始化plus.sqlite（App环境）
// stage: 0 首次打开；1 已清理 journal/权限后重试；2 已复制重建文件后重试
function initPlusSqlite(stage = 0) {
	return new Promise((resolve, reject) => {
		plus.sqlite.openDatabase({
			name: dbName,
			path: '_doc/' + dbName + '.db',
			success: function () {
				db = dbName;
				createTables().then(resolve).catch(reject);
			},
			fail: function (e) {
				if (!isDbCantOpenError(e) || stage >= 2) {
					reject(e);
					return;
				}
				if (stage === 0) {
					// 原因 1：残留 -journal 事务日志，或文件权限被外部写入覆盖
					prepareDbForRetry()
						.then(() => initPlusSqlite(1))
						.then(resolve)
						.catch(reject);
				} else {
					// 原因 2：文件属主不是 App（用文件管理器/MTP 覆盖），在 App 进程内复制重建
					rebuildDbFile()
						.then(() => initPlusSqlite(2))
						.then(resolve)
						.catch((err) => {
							reject({
								code: -1404,
								message: '数据库文件不可读，自动修复失败：' + toErrText(err) +
									'。请彻底关闭 App（从后台移除）后删除 car_management.db-journal，再替换 car_management.db 并重新启动。'
							});
						});
				}
			}
		});
	});
}

/** -1404 / CantOpen：数据库文件打不开，多为权限异常或残留 journal */
function isDbCantOpenError(e) {
	if (!e) {
		return false;
	}
	const text = typeof e === 'string' ? e : (e.message || e.msg || e.error || '');
	return e.code === -1404 || /CantOpen|not readable|Unable to open database/i.test(String(text));
}

function toErrText(err) {
	if (!err) {
		return '未知错误';
	}
	if (typeof err === 'string') {
		return err;
	}
	return String(err.message || err.msg || err.error || JSON.stringify(err));
}

/** 重试前清理：删掉 -journal 残留，并尽量恢复 db 文件的读写权限 */
function prepareDbForRetry() {
	return new Promise((resolve) => {
		// #ifdef APP-PLUS
		tryChmodDbFile();
		// #endif
		if (typeof plus === 'undefined' || !plus.io) {
			resolve();
			return;
		}
		plus.io.resolveLocalFileSystemURL('_doc/' + dbName + '.db-journal', function (entry) {
			entry.remove(function () { resolve(); }, function () { resolve(); });
		}, function () {
			resolve();
		});
	});
}

// #ifdef APP-PLUS
/** 文件被 MTP/文件管理器覆盖后属主可能不是 App，尝试恢复读写权限（非属主时静默失败） */
function tryChmodDbFile() {
	try {
		const File = plus.android.importClass('java.io.File');
		const file = new File(plus.io.convertLocalFileSystemURL('_doc/' + dbName + '.db'));
		if (file.exists()) {
			file.setReadable(true, false);
			file.setWritable(true, false);
		}
	} catch (e) {}
}
// #endif

/**
 * 用 sourceUrl 指向的文件替换 _doc 里的库：先复制成临时文件，成功后再替换原名
 * （分两步是为了复制失败时不至于把现有库删掉）
 */
function replaceDocDbFile(sourceUrl) {
	return new Promise((resolve, reject) => {
		if (typeof plus === 'undefined' || !plus.io) {
			reject('plus.io 不可用');
			return;
		}
		const targetName = dbName + '.db';
		const tempName = dbName + '_rebuild.db';
		const journalName = targetName + '-journal';

		// 删除文件；文件不存在或删不掉都继续（不阻塞流程）
		const removeQuiet = (name, next) => {
			plus.io.resolveLocalFileSystemURL('_doc/' + name, function (entry) {
				entry.remove(function () { next(); }, function () { next(); });
			}, function () {
				next();
			});
		};

		plus.io.resolveLocalFileSystemURL('_doc/', function (dirEntry) {
			plus.io.resolveLocalFileSystemURL(sourceUrl, function (srcEntry) {
				removeQuiet(tempName, function () {
					srcEntry.copyTo(dirEntry, tempName, function () {
						// 复制成功后才动原库：删旧库 + 残留 journal，再把临时文件改回原名
						removeQuiet(targetName, function () {
							removeQuiet(journalName, function () {
								plus.io.resolveLocalFileSystemURL('_doc/' + tempName, function (tempEntry) {
									tempEntry.moveTo(dirEntry, targetName, function () {
										resolve();
									}, function (err) {
										reject('替换数据库文件失败：' + toErrText(err));
									});
								}, function (err) {
									reject('临时数据库文件解析失败：' + toErrText(err));
								});
							});
						});
					}, function (err) {
						reject('数据库文件不可读：' + toErrText(err));
					});
				});
			}, function (err) {
				reject('未找到数据库文件：' + toErrText(err));
			});
		}, function (err) {
			reject('无法访问 _doc 目录：' + toErrText(err));
		});
	});
}

/** 在 App 进程内把 db 复制成新文件（新文件属主为 App，权限正常），再替换回原名 */
function rebuildDbFile() {
	return replaceDocDbFile('_doc/' + dbName + '.db');
}

/**
 * 按候选路径依次尝试导入：在 App 进程内复制进 _doc（新文件属主为 App，权限正常）
 * 同一文件只导入一次（按路径+大小+修改时间做指纹），避免每次启动覆盖 App 内新增数据
 */
function importDbFrom(candidates, force = false) {
	return new Promise((resolve) => {
		if (typeof plus === 'undefined' || !plus.io) {
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
			plus.io.resolveLocalFileSystemURL(url, function (fileEntry) {
				// 导入成功后才记指纹；失败不记，下次启动还会再试
				const doImport = (fingerprint) => {
					replaceDocDbFile(url)
						.then(() => {
							if (fingerprint) {
								writeImportMark(fingerprint);
							}
							resolve({ installed: true, source: url });
						})
						.catch(() => {
							tryNext(index + 1);
						});
				};
				fileEntry.getMetadata(function (meta) {
					const fingerprint = url + '|' + meta.size + '|' + meta.modificationTime;
					if (!force && mark === fingerprint) {
						resolve({ installed: false, skipped: true });
						return;
					}
					doImport(fingerprint);
				}, function () {
					// 拿不到元数据无法去重，那就直接导入
					doImport('');
				});
			}, function () {
				tryNext(index + 1);
			});
		};

		tryNext(0);
	});
}

/**
 * 导入用户从「App 内文件选择器」选中的库（base64）
 * 由 App 自己写盘，属主/权限正常，不依赖任何外部存储权限
 */
export function importDbFromBase64(base64) {
	if (!base64) {
		return Promise.reject('文件内容为空');
	}
	const tempName = dbName + '_import.db';
	return closeDb()
		.catch(() => {})
		.then(() => {
			db = null;
			initPromise = null;
			return writeDocFile(tempName, base64);
		})
		.then(() => replaceDocDbFile('_doc/' + tempName))
		.then(() => initDb(true));
}

/** 把当前库导出到手机 Download 目录，返回文件名 */
export function exportDbToDownload() {
	const fileName = 'car_management_' + formatStamp() + '.db';
	return closeDb()
		.catch(() => {})
		.then(() => {
			db = null;
			initPromise = null;
			return readDocDbBase64();
		})
		.then((dataUrl) => {
			const base64 = String(dataUrl).replace(/^data:.*?,/, '');
			return saveToDownloads(fileName, base64);
		})
		.then(() => initDb(true))
		.then(() => fileName)
		.catch((err) => {
			// 导出失败也要把库重新打开，否则后续页面全是「数据库未初始化」
			return initDb(true).catch(() => {}).then(() => {
				throw err;
			});
		});
}

/** 用 FileWriter.writeAsBinary 把 base64 写成 _doc 下的文件 */
function writeDocFile(name, base64) {
	return new Promise((resolve, reject) => {
		if (typeof plus === 'undefined' || !plus.io) {
			reject('plus.io 不可用');
			return;
		}
		plus.io.resolveLocalFileSystemURL('_doc/', function (dirEntry) {
			const createAndWrite = function () {
				dirEntry.getFile(name, { create: true }, function (fileEntry) {
					fileEntry.createWriter(function (writer) {
						writer.onwrite = function () {
							resolve();
						};
						writer.onerror = function (e) {
							reject('写入文件失败：' + toErrText(e));
						};
						writer.writeAsBinary(base64);
					}, function (e) {
						reject('创建写入器失败：' + toErrText(e));
					});
				}, function (e) {
					reject('创建文件失败：' + toErrText(e));
				});
			};
			plus.io.resolveLocalFileSystemURL('_doc/' + name, function (entry) {
				entry.remove(createAndWrite, createAndWrite);
			}, createAndWrite);
		}, function (e) {
			reject('无法访问 _doc 目录：' + toErrText(e));
		});
	});
}

/** 读出 _doc 里的库（dataURL 形式的 base64） */
function readDocDbBase64() {
	return new Promise((resolve, reject) => {
		plus.io.resolveLocalFileSystemURL('_doc/' + dbName + '.db', function (entry) {
			entry.file(function (file) {
				const reader = new plus.io.FileReader();
				reader.onloadend = function (e) {
					resolve(String((e.target && e.target.result) || ''));
				};
				reader.onerror = function () {
					reject('读取数据库文件失败');
				};
				reader.readAsDataURL(file);
			}, function () {
				reject('读取数据库文件失败');
			});
		}, function () {
			reject('未找到数据库文件');
		});
	});
}

/** 通过 MediaStore 写入公共 Download 目录（Android 10+ 不需要存储权限） */
function saveToDownloads(fileName, base64) {
	return new Promise((resolve, reject) => {
		try {
			// plus.android 拿到的 Java 对象必须用 plus.android.invoke 调方法，
			// 直接 obj.method(...) 会报 "xxx is not a function"
			const version = parseInt(plus.os.version, 10) || 0;
			if (version < 10) {
				reject('系统版本低于 Android 10，暂不支持导出到 Download 目录');
				return;
			}

			const Uri = plus.android.importClass('android.net.Uri');
			const Base64 = plus.android.importClass('android.util.Base64');

			const values = plus.android.newObject('android.content.ContentValues');
			plus.android.invoke(values, 'put', '_display_name', fileName);
			plus.android.invoke(values, 'put', 'mime_type', 'application/octet-stream');

			const main = plus.android.runtimeMainActivity();
			const resolver = plus.android.invoke(main, 'getContentResolver');
			// MediaStore.Downloads.EXTERNAL_CONTENT_URI
			const collection = Uri.parse('content://media/external/downloads');
			const uri = plus.android.invoke(resolver, 'insert', collection, values);
			if (!uri) {
				reject('无法在 Download 目录创建文件');
				return;
			}

			const out = plus.android.invoke(resolver, 'openOutputStream', uri);
			if (!out) {
				reject('无法写入 Download 目录');
				return;
			}
			// Base64.DEFAULT = 0
			plus.android.invoke(out, 'write', Base64.decode(base64, 0));
			plus.android.invoke(out, 'flush');
			plus.android.invoke(out, 'close');
			resolve();
		} catch (e) {
			reject('导出失败：' + toErrText(e));
		}
	});
}

function formatStamp() {
	const d = new Date();
	const p = (n) => (n < 10 ? '0' + n : String(n));
	return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
		'_' + p(d.getHours()) + p(d.getMinutes());
}

function readImportMark() {
	try {
		return uni.getStorageSync(DB_IMPORT_MARK_KEY) || '';
	} catch (e) {
		return '';
	}
}

function writeImportMark(fingerprint) {
	try {
		uni.setStorageSync(DB_IMPORT_MARK_KEY, fingerprint);
	} catch (e) {}
}

// 创建表（App环境）
function createTables() {
	return new Promise((resolve, reject) => {
		// 创建车辆表
		const createCarTable = `
			CREATE TABLE IF NOT EXISTS car (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				carNumber TEXT,
				imagePath TEXT,
				createdAt TEXT
			);
		`;

		// 创建保险表（与 pages/insurance 中 carName 字段一致）
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

		// 创建保养表（与 pages/maintenance 中 carName 字段一致）
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

		// 创建租赁记录表
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

		// 创建统计配置表
		const createStatisticsTable = `
			CREATE TABLE IF NOT EXISTS statistics_config (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				key TEXT UNIQUE,
				value TEXT,
				updatedAt TEXT
			);
		`;

		// 逐条执行建表，避免部分端上多语句一次执行失败
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
				success: function () {
					runNext(index + 1);
				},
				fail: function (e) {
					reject(e);
				}
			});
		};
		runNext(0);
	});
}

/** 旧版库仅有 carNumber、无 carName 时补列（新库建表已含 carName 时 ALTER 会失败，忽略即可） */
function migratePlusSqliteLegacyColumns() {
	return new Promise((resolve) => {
		const alters = [
			'ALTER TABLE insurance ADD COLUMN carName TEXT',
			'ALTER TABLE maintenance ADD COLUMN carName TEXT'
		];
		const runNext = (i) => {
			if (i >= alters.length) {
				resolve();
				return;
			}
			plus.sqlite.executeSql({
				name: dbName,
				sql: alters[i],
				success: function () {
					runNext(i + 1);
				},
				fail: function () {
					runNext(i + 1);
				}
			});
		};
		runNext(0);
	});
}

// 执行SQL查询
export function executeSql(sql, params = []) {
	return waitForDb().then(() => new Promise((resolve, reject) => {
		if (useIndexedDbStorage()) {
			// 浏览器环境使用IndexedDB
			executeIndexedDb(sql, params).then(resolve).catch(reject);
		} else {
			const boundSql = bindPlusSqlParams(sql, params);
			plus.sqlite.executeSql({
				name: dbName,
				sql: boundSql,
				success: function (res) {
					resolve(res);
				},
				fail: function (e) {
					reject(e);
				}
			});
		}
	}));
}

// 查询数据
export function query(sql, params = []) {
	return waitForDb().then(() => new Promise((resolve, reject) => {
		if (useIndexedDbStorage()) {
			// 浏览器环境使用IndexedDB
			queryIndexedDb(sql, params).then(resolve).catch(reject);
		} else {
			const boundSql = bindPlusSqlParams(sql, params);
			plus.sqlite.selectSql({
				name: dbName,
				sql: boundSql,
				success: function (res) {
					resolve(res);
				},
				fail: function (e) {
					reject(e);
				}
			});
		}
	}));
}

// 关闭数据库
export function closeDb() {
	return new Promise((resolve, reject) => {
		if (!db) {
			resolve();
			return;
		}

		if (useIndexedDbStorage()) {
			// 浏览器环境关闭IndexedDB
			if (indexedDb) {
				indexedDb.close();
				indexedDb = null;
			}
			db = null;
			resolve();
		} else {
			plus.sqlite.closeDatabase({
				name: dbName,
				success: function () {
					db = null;
					resolve();
				},
				fail: function (e) {
					reject(e);
				}
			});
		}
	});
}

// 在IndexedDB中执行SQL（简化实现）
function executeIndexedDb(sql, params) {
	return new Promise((resolve, reject) => {
		// 这里实现简化的SQL解析和执行
		// 实际项目中可能需要更复杂的SQL解析器
		try {
			// 提取表名和操作类型
			const lowerSql = sql.toLowerCase();
			let tableName = '';
			let operation = '';

			if (lowerSql.startsWith('insert into')) {
				operation = 'insert';
				tableName = lowerSql.match(/insert into\s+(\w+)/)[1];
			} else if (lowerSql.startsWith('update')) {
				operation = 'update';
				tableName = lowerSql.match(/update\s+(\w+)/)[1];
			} else if (lowerSql.startsWith('delete from')) {
				operation = 'delete';
				tableName = lowerSql.match(/delete from\s+(\w+)/)[1];
			}

			if (!tableName) {
				reject('不支持的SQL操作');
				return;
			}

			const transaction = indexedDb.transaction([tableName], 'readwrite');
			const store = transaction.objectStore(tableName);

			if (operation === 'insert') {
				// 解析SQL语句，提取字段名
				const fieldsMatch = sql.match(/\(([^)]+)\)/);
				const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);

				if (fieldsMatch && valuesMatch) {
					const fields = fieldsMatch[1].split(',').map(field => field.trim());
					const values = params;

					// 构建对象
					const item = {};
					fields.forEach((field, index) => {
						if (index < values.length) {
							item[field] = values[index];
						}
					});

					const request = store.put(item);
					request.onsuccess = function () {
						resolve({ affectedRows: 1 });
					};
					request.onerror = function (event) {
						reject(event.target.error);
					};
				} else {
					reject('无效的INSERT语句');
				}
			} else if (operation === 'update') {
				// 简化处理，假设更新操作是基于id
				const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
				if (idMatch && params.length > 0) {
					// id是最后一个参数
					const id = params[params.length - 1];
					// 先获取对象
					const getRequest = store.get(id);
					getRequest.onsuccess = function (event) {
						const item = event.target.result;
						if (item) {
							// 解析SET子句来更新字段
							const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
							if (setMatch) {
								const setClause = setMatch[1].trim();
								const fields = setClause.split(',').map(field => field.trim().split('=')[0].trim());
								// 更新字段值
								fields.forEach((field, index) => {
									if (index < params.length - 1) {
										item[field] = params[index];
									}
								});
							}
							const request = store.put(item);
							request.onsuccess = function () {
								resolve({ affectedRows: 1 });
							};
							request.onerror = function (event) {
								reject(event.target.error);
							};
						} else {
							reject('记录不存在');
						}
					};
					getRequest.onerror = function (event) {
						reject(event.target.error);
					};
				} else {
					reject('无效的UPDATE语句');
				}
			} else if (operation === 'delete') {
				const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
				if (idMatch && params.length > 0) {
					const id = params[0];
					const request = store.delete(id);
					request.onsuccess = function () {
						resolve({ affectedRows: 1 });
					};
					request.onerror = function (event) {
						reject(event.target.error);
					};
				} else if (/^\s*delete\s+from\s+\w+\s*;?\s*$/i.test(sql.trim())) {
					const clearReq = store.clear();
					clearReq.onsuccess = function () {
						resolve({ affectedRows: 1 });
					};
					clearReq.onerror = function (event) {
						reject(event.target.error);
					};
				} else {
					reject('无效的DELETE语句');
				}
			}

			transaction.oncomplete = function () {
				// 事务完成
			};
		} catch (error) {
			reject(error);
		}
	});
}

// 在IndexedDB中查询数据（轻量 SQL 解析，仅覆盖本项目用到的语法）
function queryIndexedDb(sql, params) {
	return new Promise((resolve, reject) => {
		if (!indexedDb) {
			reject('数据库未初始化');
			return;
		}

		const fromMatch = sql.match(/\bfrom\s+(\w+)/i);
		if (!fromMatch) {
			reject('不支持的SQL查询');
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

				let result = (groupBy || aggregates.length)
					? aggregateRows(rows, groupBy, aggregates, aliases)
					: rows;
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

/** 解析 WHERE（仅支持单条件：id = ? / carId = ? / substr(field, 起始, 长度) = ? / field = ?） */
function parseWhereClause(sql) {
	const m = sql.match(/where\s+([\s\S]+?)(?:\s+order\s+by\s|\s+group\s+by\s|\s+limit\s|;|$)/i);
	if (!m) {
		return null;
	}
	const clause = m[1].trim();
	if (/^id\s*=\s*\?$/i.test(clause)) {
		return { kind: 'id' };
	}
	if (/^carid\s*=\s*\?$/i.test(clause)) {
		return { kind: 'carId' };
	}
	const sub = clause.match(/^substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*=\s*\?$/i);
	if (sub) {
		return { kind: 'substr', field: sub[1], start: parseInt(sub[2], 10), len: parseInt(sub[3], 10) };
	}
	const eq = clause.match(/^(\w+)\s*=\s*\?$/i);
	if (eq) {
		return { kind: 'eq', field: eq[1] };
	}
	return null;
}

/** 解析 SELECT 列表里的别名，如 substr(startDate, 1, 7) as month */
function parseSelectAliases(sql) {
	const fromIndex = sql.search(/\bfrom\b/i);
	const selectList = fromIndex > 0 ? sql.substring(0, fromIndex) : sql;
	const aliases = {};
	const re = /(substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)|\w+)\s+as\s+(\w+)/gi;
	let m;
	while ((m = re.exec(selectList))) {
		const alias = m[5];
		if (m[2]) {
			aliases[alias] = { kind: 'substr', field: m[2], start: parseInt(m[3], 10), len: parseInt(m[4], 10) };
		} else {
			aliases[alias] = { kind: 'field', field: m[1] };
		}
	}
	return aliases;
}

/** 解析 SUM(...) as x / COUNT(*) as x */
function parseAggregates(sql) {
	const fromIndex = sql.search(/\bfrom\b/i);
	const selectList = fromIndex > 0 ? sql.substring(0, fromIndex) : sql;
	const list = [];
	let m;
	const sumRe = /sum\s*\(([\s\S]*?)\)\s+as\s+(\w+)/gi;
	while ((m = sumRe.exec(selectList))) {
		list.push({ type: 'sum', expr: m[1].trim(), alias: m[2] });
	}
	const countRe = /count\s*\(\s*(?:\*|[\w.]+)\s*\)\s+as\s+(\w+)/gi;
	while ((m = countRe.exec(selectList))) {
		list.push({ type: 'count', alias: m[1] });
	}
	return list;
}

/** 解析 GROUP BY 的字段（去掉后面的 ORDER BY / LIMIT） */
function parseGroupBy(sql) {
	const m = sql.match(/group\s+by\s+([\s\S]+?)(?:\s+order\s+by\s|\s+limit\s|;|$)/i);
	return m ? m[1].trim() : null;
}

/** 解析 ORDER BY，支持多字段与 asc/desc */
function parseOrderBy(sql) {
	const m = sql.match(/order\s+by\s+([\s\S]+?)(?:\s+limit\s|;|$)/i);
	if (!m) {
		return [];
	}
	return m[1]
		.split(',')
		.map((part) => {
			const text = part.trim().replace(/\s+/g, ' ');
			if (!text) {
				return null;
			}
			const desc = /\bdesc\b/i.test(text);
			const field = text.replace(/\b(asc|desc)\b/gi, '').trim();
			return field ? { field, desc } : null;
		})
		.filter(Boolean);
}

function parseLimit(sql) {
	const m = sql.match(/limit\s+(\d+)/i);
	return m ? parseInt(m[1], 10) : 0;
}

/** 计算 SUM 表达式在当前行的值（支持 CASE WHEN a IS NOT NULL THEN b ELSE c END，其余按字段名处理） */
function sumExprValue(expr, row) {
	const text = String(expr || '').trim();
	const caseMatch = text.match(
		/^case\s+when\s+(\w+)\s+is\s+not\s+null\s+then\s+(\w+)\s+else\s+(\w+)\s+end$/i
	);
	let field;
	if (caseMatch) {
		field = row[caseMatch[1]] != null ? caseMatch[2] : caseMatch[3];
	} else {
		field = text.replace(/[^A-Za-z0-9_]/g, '');
	}
	const value = parseFloat(row[field]);
	return Number.isFinite(value) ? value : 0;
}

/** 计算某行在某分组字段上的分组键 */
function groupKeyValue(row, groupToken, aliases) {
	const token = String(groupToken).trim();
	const inline = token.match(/^substr\s*\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
	if (inline) {
		const value = row[inline[1]];
		return value == null ? '' : String(value).substr(parseInt(inline[2], 10) - 1, parseInt(inline[3], 10));
	}
	const alias = aliases[token];
	if (alias && alias.kind === 'substr') {
		const value = row[alias.field];
		return value == null ? '' : String(value).substr(alias.start - 1, alias.len);
	}
	const field = alias && alias.kind === 'field' ? alias.field : token;
	const value = row[field];
	return value == null ? '' : String(value);
}

/** 分组 + 聚合；无 GROUP BY 时返回单行汇总 */
function aggregateRows(rows, groupBy, aggregates, aliases) {
	const buildRow = (groupRows, key) => {
		const out = {};
		if (groupBy) {
			out[groupBy] = key;
		}
		aggregates.forEach((agg) => {
			if (agg.type === 'count') {
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
		return [buildRow(rows, '')];
	}

	const groups = new Map();
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
			if (typeof av === 'string' || typeof bv === 'string') {
				cmp = String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv));
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

/** 读取数据：主键/索引命中时避免全表扫描，其余情况 getAll + 内存过滤 */
function readRows(tableName, where, params) {
	return new Promise((resolve, reject) => {
		const fail = (event) => reject((event && event.target && event.target.error) || new Error('IndexedDB读取失败'));

		let transaction;
		try {
			transaction = indexedDb.transaction([tableName], 'readonly');
		} catch (error) {
			reject(error);
			return;
		}
		const store = transaction.objectStore(tableName);

		// 主键查询
		if (where && where.kind === 'id' && params && params.length > 0) {
			const req = store.get(params[0]);
			req.onsuccess = () => resolve(req.result ? [req.result] : []);
			req.onerror = fail;
			return;
		}

		// carId 查询：优先走索引；索引无命中时用宽松比较兜底（兼容历史数据里字符串/数字混存）
		if (where && where.kind === 'carId' && params && params.length > 0) {
			const key = params[0];
			const hasIndex = store.indexNames && store.indexNames.contains('carId');
			if (hasIndex) {
				const indexReq = store.index('carId').getAll(key);
				indexReq.onsuccess = () => {
					if (indexReq.result && indexReq.result.length > 0) {
						resolve(indexReq.result);
						return;
					}
					const allReq = store.getAll();
					allReq.onsuccess = () => resolve(filterRows(allReq.result || [], where, params));
					allReq.onerror = fail;
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
	if (where.kind === 'id') {
		return rows.filter((row) => row.id == params[0]);
	}
	if (where.kind === 'carId') {
		return rows.filter((row) => row.carId == params[0]);
	}
	if (where.kind === 'substr') {
		const value = params[0];
		return rows.filter((row) => {
			const fieldValue = row[where.field];
			return fieldValue != null && String(fieldValue).substr(where.start - 1, where.len) == value;
		});
	}
	if (where.kind === 'eq') {
		return rows.filter((row) => row[where.field] == params[0]);
	}
	return rows;
}
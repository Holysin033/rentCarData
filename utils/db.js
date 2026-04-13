// 数据库管理模块
const dbName = 'car_management';
let db = null;
let indexedDb = null;

/** 5+ 官方为 openDatabase / closeDatabase，无 open / close */
function hasPlusSqlite() {
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
export function initDb() {
	return new Promise((resolve, reject) => {
		const runInit = () => {
			if (hasPlusSqlite()) {
				initPlusSqlite().then(resolve).catch(reject);
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
}

// 初始化IndexedDB（浏览器环境）
function initIndexedDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(dbName, 1);

		request.onerror = function (event) {
			reject('IndexedDB打开失败: ' + event.target.error);
		};

		request.onsuccess = function (event) {
			indexedDb = event.target.result;
			db = dbName;
			resolve();
		};

		request.onupgradeneeded = function (event) {
			const db = event.target.result;

			// 创建车辆表
			if (!db.objectStoreNames.contains('car')) {
				db.createObjectStore('car', { keyPath: 'id', autoIncrement: true });
			}

			// 创建保险表
			if (!db.objectStoreNames.contains('insurance')) {
				db.createObjectStore('insurance', { keyPath: 'id', autoIncrement: true });
			}

			// 创建保养表
			if (!db.objectStoreNames.contains('maintenance')) {
				db.createObjectStore('maintenance', { keyPath: 'id', autoIncrement: true });
			}

			// 创建租赁记录表
			if (!db.objectStoreNames.contains('rental')) {
				db.createObjectStore('rental', { keyPath: 'id', autoIncrement: true });
			}

			// 创建统计配置表
			if (!db.objectStoreNames.contains('statistics_config')) {
				db.createObjectStore('statistics_config', { keyPath: 'id', autoIncrement: true });
			}
		};
	});
}

// 初始化plus.sqlite（App环境）
function initPlusSqlite() {
	return new Promise((resolve, reject) => {
		plus.sqlite.openDatabase({
			name: dbName,
			path: '_doc/' + dbName + '.db',
			success: function () {
				db = dbName;
				createTables().then(resolve).catch(reject);
			},
			fail: function (e) {
				reject(e);
			}
		});
	});
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
	return new Promise((resolve, reject) => {
		if (!db) {
			reject('数据库未初始化');
			return;
		}

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
	});
}

// 查询数据
export function query(sql, params = []) {
	return new Promise((resolve, reject) => {
		if (!db) {
			reject('数据库未初始化');
			return;
		}

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
	});
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

// 在IndexedDB中查询数据（简化实现）
function queryIndexedDb(sql, params) {
	return new Promise((resolve, reject) => {
		// 这里实现简化的SQL查询
		// 实际项目中可能需要更复杂的SQL解析器
		try {
			// 提取表名
			const lowerSql = sql.toLowerCase();
			let tableName = '';

			if (lowerSql.startsWith('select')) {
				tableName = lowerSql.match(/from\s+(\w+)/)[1];
			}

			if (!tableName) {
				reject('不支持的SQL查询');
				return;
			}

			const transaction = indexedDb.transaction([tableName], 'readonly');
			const store = transaction.objectStore(tableName);
			const request = store.getAll();

			request.onsuccess = function (event) {
				let result = event.target.result;

				// 处理WHERE子句
				const whereMatch = sql.match(/WHERE\s+([^;]+)/i);
				if (whereMatch) {
					const whereClause = whereMatch[1];
					// 处理id = ? 或 carId = ? 的情况
					if (whereClause.includes('id = ?') && params.length > 0) {
						const id = params[0];
						result = result.filter(item => item.id == id);
					} else if (whereClause.includes('carId = ?') && params.length > 0) {
						const carId = params[0];
						result = result.filter(item => item.carId == carId);
					} else if (whereClause.includes('substr') && params.length > 0) {
						// 处理substr(startDate, 1, 7) = ? 的情况
						const value = params[0];
						result = result.filter(item => {
							if (whereClause.includes('startDate')) {
								return item.startDate && item.startDate.substring(0, 7) == value;
							} else if (whereClause.includes('maintenanceDate')) {
								return item.maintenanceDate && item.maintenanceDate.substring(0, 7) == value;
							}
							return false;
						});
					}
				}

				// 处理GROUP BY子句和聚合函数
				const groupMatch = sql.match(/group by\s+([^;]+)/i);
				if (groupMatch) {
					const groupField = groupMatch[1].trim();
					const sumMatch = sql.match(/sum\s*\(.*?\)\s*as\s*(\w+)/i);
					if (sumMatch) {
						const sumField = sumMatch[1];
						// 分组求和
						const groupedData = {};
						result.forEach(item => {
							let groupKey;
							if (groupField === 'substr(startDate, 1, 7)') {
								groupKey = item.startDate ? item.startDate.substring(0, 7) : '';
							} else if (groupField === 'carName') {
								groupKey = item.carName || '';
							} else {
								groupKey = item[groupField] || '';
							}
							if (!groupedData[groupKey]) {
								groupedData[groupKey] = 0;
							}
							// 计算收入，优先使用changedTotalAmount，否则使用initialTotalAmount
							const amount = item.changedTotalAmount || item.initialTotalAmount || 0;
							groupedData[groupKey] += amount;
						});
						// 转换为数组
						result = Object.entries(groupedData).map(([key, value]) => {
							const item = {};
							if (groupField === 'substr(startDate, 1, 7)') {
								item.month = key;
							} else if (groupField === 'carName') {
								item.carName = key;
								// 计算租约数
								item.count = result.filter(i => i.carName === key).length;
							} else {
								item[groupField] = key;
							}
							item[sumField] = value;
							return item;
						});
					}
				}

				// 处理ORDER BY子句
				const orderMatch = sql.match(/order by\s+([^;]+)/i);
				if (orderMatch) {
					const orderClause = orderMatch[1].trim();
					if (orderClause.includes('desc')) {
						const field = orderClause.replace('desc', '').trim();
						// 处理字符串类型的排序
						result.sort((a, b) => {
							if (typeof a[field] === 'string' && typeof b[field] === 'string') {
								return b[field].localeCompare(a[field]);
							} else {
								return b[field] - a[field];
							}
						});
					} else if (orderClause.includes('asc')) {
						const field = orderClause.replace('asc', '').trim();
						// 处理字符串类型的排序
						result.sort((a, b) => {
							if (typeof a[field] === 'string' && typeof b[field] === 'string') {
								return a[field].localeCompare(b[field]);
							} else {
								return a[field] - b[field];
							}
						});
					}
				}

				// 处理LIMIT子句
				const limitMatch = sql.match(/limit\s+(\d+)/i);
				if (limitMatch) {
					const limit = parseInt(limitMatch[1]);
					result = result.slice(0, limit);
				}

				// 模拟SQL查询结果格式
				resolve(result);
			};

			request.onerror = function (event) {
				reject(event.target.error);
			};
		} catch (error) {
			reject(error);
		}
	});
}
// 数据库管理模块
const dbName = 'car_management';
let db = null;
let isBrowser = typeof plus === 'undefined';
let indexedDb = null;

// 初始化数据库
export function initDb() {
	return new Promise((resolve, reject) => {
		if (isBrowser) {
			// 浏览器环境使用IndexedDB
			initIndexedDB().then(resolve).catch(reject);
		} else {
			// App环境使用plus.sqlite
			initPlusSqlite().then(resolve).catch(reject);
		}
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
		// 打开数据库
		plus.sqlite.open({
			name: dbName,
			path: '_doc/' + dbName + '.db',
			success: function () {
				db = dbName;
				// 创建表
				createTables().then(resolve).catch(reject);
			},
			error: function (e) {
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

		// 创建保险表
		const createInsuranceTable = `
			CREATE TABLE IF NOT EXISTS insurance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				carId INTEGER,
				carNumber TEXT,
				company TEXT,
				expireDate TEXT,
				premium REAL,
				createdAt TEXT,
				FOREIGN KEY (carId) REFERENCES car(id)
			);
		`;

		// 创建保养表
		const createMaintenanceTable = `
			CREATE TABLE IF NOT EXISTS maintenance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				carId INTEGER,
				carNumber TEXT,
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

		// 执行创建表的SQL
		plus.sqlite.executeSql({
			dbname: dbName,
			sql: createCarTable + createInsuranceTable + createMaintenanceTable + createRentalTable + createStatisticsTable,
			success: function () {
				resolve();
			},
			error: function (e) {
				reject(e);
			}
		});
	});
}

// 执行SQL查询
export function executeSql(sql, params = []) {
	return new Promise((resolve, reject) => {
		if (!db) {
			reject('数据库未初始化');
			return;
		}

		if (isBrowser) {
			// 浏览器环境使用IndexedDB
			executeIndexedDb(sql, params).then(resolve).catch(reject);
		} else {
			// App环境使用plus.sqlite
			plus.sqlite.executeSql({
				dbname: dbName,
				sql: sql,
				params: params,
				success: function (res) {
					resolve(res);
				},
				error: function (e) {
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

		if (isBrowser) {
			// 浏览器环境使用IndexedDB
			queryIndexedDb(sql, params).then(resolve).catch(reject);
		} else {
			// App环境使用plus.sqlite
			plus.sqlite.selectSql({
				dbname: dbName,
				sql: sql,
				params: params,
				success: function (res) {
					resolve(res);
				},
				error: function (e) {
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

		if (isBrowser) {
			// 浏览器环境关闭IndexedDB
			if (indexedDb) {
				indexedDb.close();
				indexedDb = null;
			}
			db = null;
			resolve();
		} else {
			// App环境关闭plus.sqlite
			plus.sqlite.close({
				name: dbName,
				success: function () {
					db = null;
					resolve();
				},
				error: function (e) {
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

					const request = store.add(item);
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
				// 简化处理，假设删除操作是基于id
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
					}
				}

				// 处理ORDER BY子句11
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
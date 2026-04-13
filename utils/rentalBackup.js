import { query, executeSql } from './db.js';

const RENTAL_COLUMNS = [
	'id',
	'carId',
	'carName',
	'startDate',
	'endDate',
	'days',
	'dailyRate',
	'initialTotalAmount',
	'changeAmount',
	'changeAction',
	'changedTotalAmount',
	'renterName',
	'renterPhone',
	'status',
	'createdAt',
	'updatedAt'
];

function backupFilenameStamp() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function buildInsertRental(row) {
	const params = RENTAL_COLUMNS.map((col) => {
		if (col === 'initialTotalAmount' && row.initialTotalAmount == null && row.totalAmount != null) {
			return row.totalAmount;
		}
		if (!(col in row) || row[col] === undefined) {
			return null;
		}
		return row[col];
	});
	const ph = RENTAL_COLUMNS.map(() => '?').join(', ');
	const sql = `INSERT INTO rental (${RENTAL_COLUMNS.join(', ')}) VALUES (${ph})`;
	return { sql, params };
}

/**
 * 将 JSON 写入设备：H5 触发浏览器下载；App 等写入 _doc 沙箱目录。
 */
function saveJsonToDevice(json, filename) {
	return new Promise((resolve, reject) => {
		let uniPlatform;
		try {
			uniPlatform = uni.getSystemInfoSync().uniPlatform;
		} catch (e) {
			uniPlatform = '';
		}

		if (uniPlatform === 'web') {
			if (typeof document === 'undefined') {
				reject(new Error('H5 无 document'));
				return;
			}
			const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			resolve({
				filePath: filename,
				hint: '文件已由浏览器下载，请在下载文件夹中查看。'
			});
			return;
		}

		const fs = typeof uni.getFileSystemManager === 'function' ? uni.getFileSystemManager() : null;
		if (fs) {
			const filePath = `_doc/${filename}`;
			fs.writeFile({
				filePath,
				data: json,
				encoding: 'utf8',
				success: () =>
					resolve({
						filePath,
						hint: '已保存到应用私有文档目录 _doc。Android 可通过连接电脑在应用数据目录中查找，或使用系统文件管理（视 ROM 而定）。'
					}),
				fail: (err) => reject(err || new Error('writeFile 失败'))
			});
			return;
		}

		reject(new Error('当前运行环境不支持文件导出'));
	});
}

/**
 * 仅导出 rental 表为 JSON。
 */
export function exportRentalBackup() {
	return query('SELECT * FROM rental ORDER BY id ASC').then((rows) => {
		const list = rows || [];
		const payload = {
			version: 1,
			table: 'rental',
			exportedAt: new Date().toISOString(),
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

/**
 * 选择 .json 文件并读取为 UTF-8 文本（H5 用 input；App 用 chooseFile + readFile）。
 */
export function pickAndReadJsonFile() {
	return new Promise((resolve, reject) => {
		let uniPlatform;
		try {
			uniPlatform = uni.getSystemInfoSync().uniPlatform;
		} catch (e) {
			uniPlatform = '';
		}

		if (uniPlatform === 'web') {
			if (typeof document === 'undefined') {
				reject(new Error('当前环境无法选择文件'));
				return;
			}
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json,application/json';
			input.style.cssText = 'position:fixed;left:-100px;width:1px;height:1px;opacity:0;';
			input.onchange = (e) => {
				const file = e.target.files && e.target.files[0];
				if (!file) {
					reject(new Error('未选择文件'));
					return;
				}
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(new Error('读取文件失败'));
				reader.readAsText(file);
			};
			document.body.appendChild(input);
			input.click();
			setTimeout(() => {
				try {
					document.body.removeChild(input);
				} catch (err) {
					/* ignore */
				}
			}, 500);
			return;
		}

		if (typeof uni.chooseFile === 'function') {
			uni.chooseFile({
				count: 1,
				extension: ['.json'],
				success: (res) => {
					const path =
						(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].path) ||
						(res.tempFilePaths && res.tempFilePaths[0]);
					if (!path) {
						reject(new Error('无法获取文件路径'));
						return;
					}
					uni.getFileSystemManager().readFile({
						filePath: path,
						encoding: 'utf8',
						success: (r) => {
							const txt = typeof r.data === 'string' ? r.data : String(r.data);
							resolve(txt);
						},
						fail: (err) => reject(err || new Error('readFile 失败'))
					});
				},
				fail: (err) => {
					const msg = err && (err.errMsg || err.message);
					if (msg && String(msg).indexOf('cancel') !== -1) {
						reject(new Error('已取消'));
						return;
					}
					reject(err || new Error('未选择文件'));
				}
			});
			return;
		}

		reject(new Error('当前环境不支持选择文件，请在 App 或 H5 使用'));
	});
}

/**
 * 导入租约备份：先清空 rental 表，再按备份逐条插入（会覆盖现有租约数据）。
 */
export function importRentalBackup(jsonText) {
	let payload;
	try {
		payload = JSON.parse(jsonText);
	} catch (e) {
		return Promise.reject(new Error('不是有效的 JSON 文件'));
	}
	if (!payload || payload.table !== 'rental' || !Array.isArray(payload.rows)) {
		return Promise.reject(new Error('不是本应用导出的租约备份（需包含 table: rental 与 rows 数组）'));
	}
	const rows = payload.rows;
	return executeSql('DELETE FROM rental').then(() => {
		if (rows.length === 0) {
			return { rowCount: 0 };
		}
		return rows
			.reduce((chain, row) => {
				const { sql, params } = buildInsertRental(row);
				return chain.then(() => executeSql(sql, params));
			}, Promise.resolve())
			.then(() => ({ rowCount: rows.length }));
	});
}

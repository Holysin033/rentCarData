/**
 * 车辆照片：uni.chooseImage 只返回临时文件路径，必须用 uni.saveFile 持久化后
 * 再写入数据库；不能写死 static/carImgs/...，该路径下既无真实文件，打包后 static 通常也不可写。
 */
export function chooseCarPhoto() {
	return new Promise((resolve, reject) => {
		uni.chooseImage({
			count: 1,
			sizeType: ['compressed', 'original'],
			sourceType: ['album', 'camera'],
			success: (res) => {
				const tempPath = res.tempFilePaths && res.tempFilePaths[0];
				if (!tempPath) {
					reject(new Error('未获取到图片'));
					return;
				}
				if (typeof uni.saveFile === 'function') {
					uni.saveFile({
						tempFilePath: tempPath,
						success: (saveRes) => {
							resolve(saveRes.savedFilePath);
						},
						fail: (err) => {
							console.warn('saveFile 失败，使用临时路径（部分环境重启后可能失效）', err);
							resolve(tempPath);
						}
					});
				} else {
					resolve(tempPath);
				}
			},
			fail: (err) => reject(err || new Error('选择图片失败'))
		});
	});
}

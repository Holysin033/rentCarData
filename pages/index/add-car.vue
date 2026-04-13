<template>
	<view class="container">
		<view class="form">
			<view class="form-item">
				<text class="label">车名 <text style="color: red;">*</text></text>
				<input type="text" v-model="car.name" placeholder="请输入车名" class="input" />
			</view>
			<view class="form-item">
				<text class="label">车牌号</text>
				<input type="text" v-model="car.carNumber" placeholder="请输入车牌号（选填）" class="input" />
			</view>
			<view class="form-item">
				<text class="label">照片</text>
				<view class="image-upload">
					<view v-if="car.imagePath" class="image-preview">
						<view class="image-container">
							<image :src="car.imagePath" mode="aspectFit" class="preview-image"></image>
						</view>
						<button @click="chooseImage" class="change-image-btn">更换图片</button>
					</view>
					<view v-else class="image-placeholder">
						<button @click="chooseImage" class="choose-image-btn">选择图片</button>
						<text class="hint">选择后保存到应用本地目录，列表与编辑页可正常显示</text>
					</view>
				</view>
			</view>
			<view class="button-group">
				<button @click="saveCar" class="save-btn">保存</button>
				<button @click="cancel" class="cancel-btn">取消</button>
			</view>
		</view>
	</view>
</template>

<script>
import { executeSql } from '../../utils/db.js';
import { chooseCarPhoto } from '../../utils/carImage.js';
export default {
	data() {
		return {
			car: {
				name: '',
				carNumber: '',
				imagePath: ''
			}
		};
	},
	methods: {
		saveCar() {
			// 验证表单
			if (!this.car.name) {
				uni.showToast({
					title: '请输入车名',
					icon: 'none'
				});
				return;
			}

			// 直接保存到数据库
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `INSERT INTO car (name, carNumber, imagePath, createdAt) VALUES (?, ?, ?, ?)`;
			const params = [this.car.name, this.car.carNumber, this.car.imagePath, new Date().toISOString()];

			executeSql(sql, params).then(() => {
				uni.showToast({
					title: '保存成功',
					icon: 'success'
				});
				// 返回上一页
				uni.navigateBack();
			}).catch(err => {
				console.error('保存失败:', err);
				uni.showToast({
					title: '保存失败',
					icon: 'none'
				});
			});
		},
		chooseImage() {
			chooseCarPhoto()
				.then((savedPath) => {
					this.car.imagePath = savedPath;
					uni.showToast({ title: '图片已保存', icon: 'success' });
				})
				.catch((err) => {
					console.error('选择图片失败:', err);
					uni.showToast({
						title: err && err.errMsg ? err.errMsg : '选择图片失败',
						icon: 'none'
					});
				});
		},
		cancel() {
			uni.navigateBack();
		}
	}
};
</script>

<style scoped>
.container {
	padding: 20rpx;
}

.form {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.form-item {
	margin-bottom: 20rpx;
}

.label {
	display: block;
	font-size: 24rpx;
	color: #333;
	margin-bottom: 8rpx;
}

.input {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
}

.picker {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
	color: #666;
}

.button-group {
	display: flex;
	gap: 20rpx;
	margin-top: 40rpx;
}

.save-btn {
	flex: 1;
	background-color: #007AFF;
	color: white;
	padding: 15rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
}

.cancel-btn {
	flex: 1;
	background-color: #f0f0f0;
	color: #333;
	padding: 15rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
}

.image-upload {
	margin-top: 10rpx;
}

.image-preview {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 20rpx;
	text-align: center;
}

.image-container {
	width: 100%;
	max-width: 400rpx;
	height: 250rpx;
	border: 1rpx solid #f0f0f0;
	border-radius: 8rpx;
	overflow: hidden;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #f9f9f9;
	margin: 0 auto 15rpx;
}

.preview-image {
	width: 100%;
	height: 100%;
	border-radius: 8rpx;
}

/* 确保图片在不同比例下都能良好显示 */
.image-container image {
	max-width: 100%;
	max-height: 100%;
}

.change-image-btn {
	background-color: #FF9500;
	color: white;
	padding: 10rpx 20rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.image-placeholder {
	border: 1rpx dashed #ddd;
	border-radius: 8rpx;
	padding: 40rpx 20rpx;
	text-align: center;
}

.choose-image-btn {
	background-color: #007AFF;
	color: white;
	padding: 15rpx 30rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
	margin-bottom: 15rpx;
}

.hint {
	font-size: 20rpx;
	color: #999;
}
</style>
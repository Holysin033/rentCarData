<template>
	<view class="container">
		<view class="form">
			<view class="form-item">
				<text class="label">车名</text>
				<picker :range="carList" range-key="name" @change="onCarChange" :value="selectedCarIndex">
					<view class="picker">
						{{ selectedCar?.name || '请选择车辆' }}
					</view>
				</picker>
			</view>
			<view class="form-item">
				<text class="label">时间</text>
				<picker mode="date" @change="onDateChange" :value="maintenance.maintenanceDate">
					<view class="picker">
						{{ maintenance.maintenanceDate || '请选择日期' }}
					</view>
				</picker>
			</view>
			<view class="form-item">
				<text class="label">费用</text>
				<input type="number" v-model="maintenance.cost" placeholder="请输入费用（元）" class="input" />
			</view>
			<view class="button-group">
				<button @click="saveMaintenance" class="save-btn">保存</button>
				<button @click="cancel" class="cancel-btn">取消</button>
			</view>
		</view>
	</view>
</template>

<script>
import { executeSql, query } from '../../utils/db.js';
export default {
	data() {
		return {
			carList: [],
			selectedCarIndex: 0,
			selectedCar: null,
			maintenance: {
				maintenanceDate: '',
				cost: ''
			}
		};
	},
	onLoad() {
		this.loadCarList();
	},
	methods: {
		loadCarList() {
			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 从数据库加载车辆列表
				const sql = `SELECT * FROM car`;
				query(sql).then(res => {
					this.carList = res || [];
					if (this.carList.length > 0) {
						this.selectedCar = this.carList[0];
					}
				}).catch(err => {
					console.error('加载车辆列表失败:', err);
					// 使用模拟数据作为 fallback
					this.carList = [
						{
							id: 1,
							name: '丰田凯美瑞'
						},
						{
							id: 2,
							name: '本田雅阁'
						}
					];
					this.selectedCar = this.carList[0];
				});
			} else {
				// H5端使用模拟数据
				this.carList = [
					{
						id: 1,
						name: '丰田凯美瑞'
					},
					{
						id: 2,
						name: '本田雅阁'
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
		saveMaintenance() {
			if (!this.selectedCar || !this.maintenance.maintenanceDate || this.maintenance.cost === '' || this.maintenance.cost === null) {
				uni.showToast({
					title: '请填写车名、时间与费用',
					icon: 'none'
				});
				return;
			}
			const costNum = parseFloat(this.maintenance.cost);
			if (Number.isNaN(costNum) || costNum < 0) {
				uni.showToast({ title: '费用请输入有效数字', icon: 'none' });
				return;
			}

			const mileage = 0;
			const items = '无';

			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 保存到数据库
				const sql = `INSERT INTO maintenance (carId, carName, maintenanceDate, mileage, cost, items, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
				const params = [this.selectedCar.id, this.selectedCar.name, this.maintenance.maintenanceDate, mileage, costNum, items, new Date().toISOString()];

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
			} else {
				// H5端使用模拟数据
				uni.showToast({
					title: '保存成功（模拟）',
					icon: 'success'
				});
				uni.navigateBack();
			}
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
</style>
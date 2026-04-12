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
				<text class="label">保险公司</text>
				<input type="text" v-model="insurance.company" placeholder="请输入保险公司" class="input" />
			</view>
			<view class="form-item">
				<text class="label">到期日期</text>
				<picker mode="date" @change="onDateChange" :value="insurance.expireDate">
					<view class="picker">
						{{ insurance.expireDate || '请选择到期日期' }}
					</view>
				</picker>
			</view>
			<view class="form-item">
				<text class="label">保费</text>
				<input type="number" v-model="insurance.premium" placeholder="请输入保费" class="input" />
			</view>
			<view class="button-group">
				<button @click="updateInsurance" class="save-btn">保存</button>
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
			insurance: {
				id: '',
				company: '',
				expireDate: '',
				premium: ''
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
			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 从数据库加载车辆列表
				const sql = `SELECT * FROM car`;
				query(sql).then(res => {
					this.carList = res || [];
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
			}
		},
		loadInsuranceInfo() {
			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 从数据库加载保险信息
				const sql = `SELECT * FROM insurance WHERE id = ?`;
				query(sql, [this.insurance.id]).then(res => {
					if (res && res.length > 0) {
						this.insurance = res[0];
						// 查找对应的车辆
						const carIndex = this.carList.findIndex(car => car.id === this.insurance.carId);
						if (carIndex !== -1) {
							this.selectedCarIndex = carIndex;
							this.selectedCar = this.carList[carIndex];
						}
					}
				}).catch(err => {
					console.error('加载保险信息失败:', err);
					// 使用模拟数据作为 fallback
					this.insurance = {
						id: this.insurance.id,
						company: '平安保险',
						expireDate: '2026-12-31',
						premium: 5000
					};
					this.selectedCar = this.carList[0];
				});
			} else {
				// H5端使用模拟数据
				this.insurance = {
					id: this.insurance.id,
					company: '平安保险',
					expireDate: '2026-12-31',
					premium: 5000
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
			// 验证表单
			if (!this.selectedCar || !this.insurance.company || !this.insurance.expireDate || !this.insurance.premium) {
				uni.showToast({
					title: '请填写完整信息',
					icon: 'none'
				});
				return;
			}

			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 更新数据库
				const sql = `UPDATE insurance SET carId = ?, carName = ?, company = ?, expireDate = ?, premium = ? WHERE id = ?`;
				const params = [this.selectedCar.id, this.selectedCar.name, this.insurance.company, this.insurance.expireDate, this.insurance.premium, this.insurance.id];

				executeSql(sql, params).then(() => {
					uni.showToast({
						title: '更新成功',
						icon: 'success'
					});
					// 返回上一页
					uni.navigateBack();
				}).catch(err => {
					console.error('更新失败:', err);
					uni.showToast({
						title: '更新失败',
						icon: 'none'
					});
				});
			} else {
				// H5端使用模拟数据
				uni.showToast({
					title: '更新成功（模拟）',
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
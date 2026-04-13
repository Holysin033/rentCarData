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
			<view class="form-item">
				<text class="label">保养里程（选填）</text>
				<input type="number" v-model="maintenance.mileage" placeholder="不填默认为 0" class="input" />
			</view>
			<view class="form-item">
				<text class="label">保养项目（选填）</text>
				<textarea v-model="maintenance.items" placeholder="不填默认为「无」" class="textarea" />
			</view>
			<view class="button-group">
				<button @click="updateMaintenance" class="save-btn">保存</button>
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
				id: '',
				maintenanceDate: '',
				cost: '',
				mileage: '',
				items: ''
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
		loadMaintenanceInfo() {
			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
				// 从数据库加载保养信息
				const sql = `SELECT * FROM maintenance WHERE id = ?`;
				query(sql, [this.maintenance.id]).then(res => {
					if (res && res.length > 0) {
						const row = res[0];
						const m = row.mileage != null ? Number(row.mileage) : 0;
						const it = row.items != null ? String(row.items) : '';
						this.maintenance = {
							id: row.id,
							maintenanceDate: row.maintenanceDate || '',
							cost: row.cost != null ? row.cost : '',
							mileage: m !== 0 ? String(m) : '',
							items: it && it !== '无' ? it : ''
						};
						const carIndex = this.carList.findIndex(car => car.id === row.carId);
						if (carIndex !== -1) {
							this.selectedCarIndex = carIndex;
							this.selectedCar = this.carList[carIndex];
						}
					}
				}).catch(err => {
					console.error('加载保养信息失败:', err);
					this.maintenance = {
						id: this.maintenance.id,
						maintenanceDate: '2026-03-15',
						cost: 800,
						mileage: '10000',
						items: '机油更换'
					};
					this.selectedCar = this.carList[0];
				});
			} else {
				this.maintenance = {
					id: this.maintenance.id,
					maintenanceDate: '2026-03-15',
					cost: 800,
					mileage: '10000',
					items: '机油更换'
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
			if (val === '' || val === null || val === undefined) return 0;
			const n = parseInt(String(val).trim(), 10);
			return Number.isFinite(n) && n >= 0 ? n : 0;
		},
		normalizeItems(val) {
			const s = val == null ? '' : String(val).trim();
			return s === '' ? '无' : s;
		},
		updateMaintenance() {
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

			const mileage = this.normalizeMileage(this.maintenance.mileage);
			const items = this.normalizeItems(this.maintenance.items);

			// 检查是否在App环境中
			if (uni.getSystemInfoSync().platform !== 'h5') {
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

.textarea {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
	min-height: 120rpx;
	box-sizing: border-box;
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
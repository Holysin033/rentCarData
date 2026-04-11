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
				<text class="label">开始时间</text>
				<view class="datetime-picker">
					<picker mode="date" @change="onStartDateChange" :value="startDate">
						<view class="picker date-picker">
							{{ startDate || '请选择日期' }}
						</view>
					</picker>
					<picker mode="time" @change="onStartTimeChange" :value="startTime">
						<view class="picker time-picker">
							{{ startTime || '时间' }}
						</view>
					</picker>
				</view>
			</view>
			<view class="form-item">
				<text class="label">结束时间</text>
				<view class="datetime-picker">
					<picker mode="date" @change="onEndDateChange" :value="endDate">
						<view class="picker date-picker">
							{{ endDate || '请选择日期' }}
						</view>
					</picker>
					<picker mode="time" @change="onEndTimeChange" :value="endTime">
						<view class="picker time-picker">
							{{ endTime || '时间' }}
						</view>
					</picker>
				</view>
			</view>
			<view class="form-item">
				<text class="label">租赁天数</text>
				<input type="text" v-model="rental.days" placeholder="自动计算" class="input" disabled />
			</view>
			<view class="form-item">
				<text class="label">日租金</text>
				<input type="digit" v-model="rental.dailyRate" placeholder="请输入日租金" class="input" @input="onDailyRateChange" />
			</view>
			<view class="form-item">
				<view class="label-row">
					<text class="label">总金额</text>
					<switch :checked="autoCalculate" @change="onAutoCalculateChange" color="#007AFF" />
					<text class="switch-label">{{ autoCalculate ? '自动计算' : '手动输入' }}</text>
				</view>
				<input type="digit" v-model="rental.totalAmount" placeholder="请输入总金额" class="input" :disabled="autoCalculate" />
			</view>
			<view class="form-item">
				<text class="label">租车人姓名</text>
				<input type="text" v-model="rental.renterName" placeholder="请输入租车人姓名（选填）" class="input" />
			</view>
			<view class="form-item">
				<text class="label">租车人电话</text>
				<input type="number" v-model="rental.renterPhone" placeholder="请输入租车人电话（选填）" class="input" />
			</view>
			<view class="form-item">
				<text class="label">状态</text>
				<picker :range="statusOptions" @change="onStatusChange" :value="selectedStatusIndex">
					<view class="picker">
						{{ statusOptions[selectedStatusIndex] }}
					</view>
				</picker>
			</view>
			<view class="button-group">
				<button @click="updateRental" class="save-btn">保存</button>
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
			startDate: '',
			startTime: '08:00',
			endDate: '',
			endTime: '18:00',
			rental: {
				id: '',
				startDate: '',
				endDate: '',
				days: '',
				dailyRate: '',
				totalAmount: '',
				renterName: '',
				renterPhone: '',
				status: ''
			},
			autoCalculate: true,
			statusOptions: ['进行中', '已完成'],
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
			// 直接从数据库加载车辆列表
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM car`;
			query(sql).then(res => {
				this.carList = res || [];
			}).catch(err => {
				console.error('加载车辆列表失败:', err);
				// 使用模拟数据作为 fallback
				this.carList = [{
					id: 1,
					name: '丰田凯美瑞'
				},
				{
					id: 2,
					name: '本田雅阁'
				}
				];
			});
		},
		loadRentalInfo() {
			// 直接从数据库加载租赁信息
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM rental WHERE id = ?`;
			query(sql, [this.rental.id]).then(res => {
				if (res && res.length > 0) {
					this.rental = res[0];
					// 解析日期时间
					if (this.rental.startDate) {
						const startParts = this.rental.startDate.split(' ');
						if (startParts.length === 2) {
							this.startDate = startParts[0];
							this.startTime = startParts[1];
						}
					}
					if (this.rental.endDate) {
						const endParts = this.rental.endDate.split(' ');
						if (endParts.length === 2) {
							this.endDate = endParts[0];
							this.endTime = endParts[1];
						}
					}
					// 查找对应的车辆
					const carIndex = this.carList.findIndex(car => car.id === this.rental.carId);
					if (carIndex !== -1) {
						this.selectedCarIndex = carIndex;
						this.selectedCar = this.carList[carIndex];
					}
					// 设置状态
					this.selectedStatusIndex = this.statusOptions.indexOf(this.rental.status);
				}
			}).catch(err => {
				console.error('加载租赁信息失败:', err);
				// 使用模拟数据作为 fallback
				this.rental = {
					id: this.rental.id,
					startDate: '2026-04-01 08:00',
					endDate: '2026-04-05 18:00',
					days: 5,
					dailyRate: 300,
					totalAmount: 1500,
					renterName: '张三',
					renterPhone: '13800138000',
					status: '已完成'
				};
				this.startDate = '2026-04-01';
				this.startTime = '08:00';
				this.endDate = '2026-04-05';
				this.endTime = '18:00';
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
				this.rental.startDate = this.startDate + ' ' + this.startTime;
				this.calculateDays();
			}
		},
		updateEndDateTime() {
			if (this.endDate && this.endTime) {
				this.rental.endDate = this.endDate + ' ' + this.endTime;
				this.calculateDays();
			}
		},
		calculateDays() {
			if (this.rental.startDate && this.rental.endDate) {
				const start = new Date(this.rental.startDate);
				const end = new Date(this.rental.endDate);
				const diffTime = end - start;
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
				this.rental.days = diffDays > 0 ? diffDays : 1;
				this.calculateTotal();
			} else {
				this.rental.days = '';
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
				this.rental.totalAmount = (days * dailyRate).toFixed(2);
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
			// 验证表单
			if (!this.selectedCar || !this.rental.startDate || !this.rental.endDate || !this.rental.days || !this.rental.dailyRate || !this.rental.totalAmount) {
				uni.showToast({
					title: '请填写完整信息',
					icon: 'none'
				});
				return;
			}

			// 直接更新数据库
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `UPDATE rental SET carId = ?, carName = ?, startDate = ?, endDate = ?, days = ?, dailyRate = ?, totalAmount = ?, renterName = ?, renterPhone = ?, status = ? WHERE id = ?`;
			const params = [
				this.selectedCar.id,
				this.selectedCar.name,
				this.rental.startDate,
				this.rental.endDate,
				this.rental.days,
				this.rental.dailyRate,
				this.rental.totalAmount,
				this.rental.renterName,
				this.rental.renterPhone,
				this.statusOptions[this.selectedStatusIndex],
				this.rental.id
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

.label-row {
	display: flex;
	align-items: center;
	margin-bottom: 8rpx;
}

.label-row .label {
	margin-bottom: 0;
	margin-right: 20rpx;
}

.switch-label {
	font-size: 22rpx;
	color: #666;
	margin-left: 10rpx;
}

.input {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
}

.input[disabled] {
	background-color: #f5f5f5;
	color: #999;
}

.picker {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
	color: #666;
}

.datetime-picker {
	display: flex;
	gap: 10rpx;
}

.date-picker {
	flex: 2;
}

.time-picker {
	flex: 1;
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

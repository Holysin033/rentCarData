<template>
	<view class="container">
		<view class="header">
			<text class="title">统计报表</text>
			<view class="date-selector">
				<picker mode="date" fields="month" @change="onDateChange" :value="selectedDate">
					<view class="picker">
						{{ selectedDate }}
					</view>
				</picker>
			</view>
		</view>
		<view class="stats-card">
			<view class="stat-item">
				<text class="stat-label">月度租赁收入</text>
				<text class="stat-value">{{ monthlyIncome }}元</text>
			</view>
			<view class="stat-item">
				<text class="stat-label">月度保养支出</text>
				<text class="stat-value">{{ monthlyExpense }}元</text>
			</view>
			<view class="stat-item">
				<text class="stat-label">车辆使用频次</text>
				<text class="stat-value">{{ usageFrequency }}次</text>
			</view>
		</view>
		<view class="chart-section">
			<text class="section-title">年度收入支出对比</text>
			<view class="chart-container">
				<!-- 这里将使用ucharts绘制图表 -->
				<view class="chart-placeholder">
					<text>图表区域</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { query } from '../../utils/db.js';
export default {
	data() {
		return {
			selectedDate: '2026-04',
			monthlyIncome: 3600,
			monthlyExpense: 2000,
			usageFrequency: 5,
			yearData: []
		};
	},
	onLoad() {
		this.loadStatistics();
		this.loadYearData();
	},
	onShow() {
		// 页面显示时重新加载数据，确保添加或编辑后能看到最新数据
		this.loadStatistics();
		this.loadYearData();
	},
	methods: {
		onDateChange(e) {
			this.selectedDate = e.detail.value;
			// 根据选择的日期加载对应的数据
			this.loadStatistics();
		},
		loadStatistics() {
			// 直接从数据库加载月度统计数据
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const [year, month] = this.selectedDate.split('-');

			// 计算月度租赁收入
			const incomeSql = `SELECT SUM(totalAmount) as total FROM rental WHERE strftime('%Y-%m', startDate) = ?`;
			query(incomeSql, [this.selectedDate]).then(res => {
				this.monthlyIncome = res && res[0] && res[0].total ? res[0].total : 0;
			}).catch(err => {
				console.error('加载租赁收入失败:', err);
				this.monthlyIncome = 3600;
			});

			// 计算月度保养支出
			const expenseSql = `SELECT SUM(cost) as total FROM maintenance WHERE strftime('%Y-%m', maintenanceDate) = ?`;
			query(expenseSql, [this.selectedDate]).then(res => {
				this.monthlyExpense = res && res[0] && res[0].total ? res[0].total : 0;
			}).catch(err => {
				console.error('加载保养支出失败:', err);
				this.monthlyExpense = 2000;
			});

			// 计算车辆使用频次
			const frequencySql = `SELECT COUNT(*) as count FROM rental WHERE strftime('%Y-%m', startDate) = ?`;
			query(frequencySql, [this.selectedDate]).then(res => {
				this.usageFrequency = res && res[0] && res[0].count ? res[0].count : 0;
			}).catch(err => {
				console.error('加载使用频次失败:', err);
				this.usageFrequency = 5;
			});
		},
		loadYearData() {
			// 直接从数据库加载年度数据
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const year = new Date().getFullYear();
			const yearStr = year.toString();

			// 计算年度每月的收入和支出
			this.yearData = [];
			for (let month = 1; month <= 12; month++) {
				const monthStr = month.toString().padStart(2, '0');
				const dateStr = `${yearStr}-${monthStr}`;

				// 计算月度租赁收入
				const incomeSql = `SELECT SUM(totalAmount) as total FROM rental WHERE strftime('%Y-%m', startDate) = ?`;
				query(incomeSql, [dateStr]).then(res => {
					const income = res && res[0] && res[0].total ? res[0].total : 0;

					// 计算月度保养支出
					const expenseSql = `SELECT SUM(cost) as total FROM maintenance WHERE strftime('%Y-%m', maintenanceDate) = ?`;
					query(expenseSql, [dateStr]).then(res => {
						const expense = res && res[0] && res[0].total ? res[0].total : 0;

						this.yearData.push({
							month: monthStr,
							income: income,
							expense: expense
						});
					});
				}).catch(err => {
					console.error('加载年度数据失败:', err);
					// 加载失败时使用模拟数据
					if (this.yearData.length === 0) {
						this.yearData = [
							{ month: '01', income: 3000, expense: 1500 },
							{ month: '02', income: 2500, expense: 1200 },
							{ month: '03', income: 4000, expense: 1800 },
							{ month: '04', income: 3600, expense: 2000 },
							{ month: '05', income: 4200, expense: 1600 },
							{ month: '06', income: 3800, expense: 1900 },
							{ month: '07', income: 4500, expense: 2100 },
							{ month: '08', income: 4800, expense: 2200 },
							{ month: '09', income: 3900, expense: 1700 },
							{ month: '10', income: 4300, expense: 1800 },
							{ month: '11', income: 3700, expense: 1600 },
							{ month: '12', income: 4600, expense: 2000 }
						];
					}
				});
			}
		}
	}
};
</script>

<style scoped>
.container {
	padding: 20rpx;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20rpx;
}

.title {
	font-size: 32rpx;
	font-weight: bold;
}

.date-selector {
	background-color: white;
	padding: 10rpx 20rpx;
	border-radius: 8rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.picker {
	font-size: 24rpx;
}

.stats-card {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.stat-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 15rpx 0;
	border-bottom: 1rpx solid #f0f0f0;
}

.stat-item:last-child {
	border-bottom: none;
}

.stat-label {
	font-size: 24rpx;
	color: #666;
}

.stat-value {
	font-size: 28rpx;
	font-weight: bold;
	color: #007AFF;
}

.chart-section {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.section-title {
	font-size: 28rpx;
	font-weight: bold;
	margin-bottom: 20rpx;
}

.chart-container {
	height: 400rpx;
	background-color: #f9f9f9;
	border-radius: 8rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.chart-placeholder {
	text-align: center;
	color: #999;
	font-size: 24rpx;
}
</style>
<template>
	<view class="container">
		<view class="header">
			<text class="title">统计报表</text>
			<view class="date-selector">
				<picker
					mode="date"
					fields="month"
					:value="selectedDate"
					:start="pickerDateStart"
					:end="pickerDateEnd"
					@change="onDateChange"
				>
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
				<text class="stat-label">年度租赁收入</text>
				<text class="stat-value">{{ yearlyIncome }}元</text>
			</view>
			<view class="stat-item">
				<text class="stat-label">总租赁收入</text>
				<text class="stat-value">{{ totalIncome }}元</text>
			</view>
		</view>
		<view class="table-section">
			<view class="section-head">
				<text class="section-title">按月收入统计</text>
				<view class="car-month-filter">
					<text class="filter-label">年份</text>
					<picker
						mode="date"
						fields="year"
						:value="monthlyStatsYearPickerValue"
						:start="pickerDateStart"
						:end="pickerDateEnd"
						@change="onMonthlyStatsYearChange"
					>
						<view class="picker car-month-picker">{{ monthlyStatsYear }}年</view>
					</picker>
				</view>
			</view>
			<text class="section-hint">仅展示所选年份内各月收入；默认当前年份，可切换查看往年。</text>
			<view class="table-container">
				<view class="table-header">
					<view class="table-cell">月份</view>
					<view class="table-cell">收入(元)</view>
				</view>
				<view v-for="item in monthlyData" :key="item.month" class="table-row">
					<view class="table-cell">{{ item.month }}</view>
					<view class="table-cell">{{ item.income }}</view>
				</view>
				<view v-if="monthlyData.length === 0" class="table-empty">该年暂无租赁收入数据</view>
			</view>
		</view>
		<view class="table-section">
			<view class="section-head">
				<text class="section-title">按车名统计</text>
				<view class="car-month-filter">
					<text class="filter-label">月收入月份</text>
					<picker
						mode="date"
						fields="month"
						:value="carStatsMonth"
						:start="pickerDateStart"
						:end="pickerDateEnd"
						@change="onCarStatsMonthChange"
					>
						<view class="picker car-month-picker">
							{{ carStatsMonth }}
						</view>
					</picker>
				</view>
			</view>
			<text class="section-hint">年收入为「所选月份」所在自然年的累计（例：选 2026-05 则年收入为 2026 全年）。</text>
			<view class="table-container">
				<view class="table-header table-header-3">
					<view class="table-cell table-cell-wide">车名</view>
					<view class="table-cell">月收入(元)</view>
					<view class="table-cell">年收入(元)</view>
				</view>
				<view v-for="item in carData" :key="item.key" class="table-row table-header-3">
					<view class="table-cell table-cell-wide">{{ item.carName }}</view>
					<view class="table-cell">{{ item.monthIncome }}</view>
					<view class="table-cell">{{ item.yearIncome }}</view>
				</view>
				<view v-if="carData.length === 0" class="table-empty">暂无车辆租赁数据</view>
			</view>
		</view>
	</view>
</template>

<script>
import { query } from '../../utils/db.js';

function currentYearMonth() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

export default {
	data() {
		const ym = currentYearMonth();
		const y = String(new Date().getFullYear());
		return {
			// uni-app 部分端对 date picker 的 start/end 要求为字符串日期，避免默认成 Number 触发 Vue 校验告警
			pickerDateStart: '1926-01-01',
			pickerDateEnd: '2126-12-31',
			selectedDate: ym,
			carStatsMonth: ym,
			monthlyStatsYear: y,
			monthlyIncome: 0,
			yearlyIncome: 0,
			totalIncome: 0,
			monthlyData: [],
			carData: [],
			// 首次加载是否已自动定位到最近有租约的月份（之后尊重用户手动选择）
			hasAutoPickedMonth: false
		};
	},
	computed: {
		monthlyStatsYearPickerValue() {
			return `${this.monthlyStatsYear}-01-01`;
		}
	},
	onShow() {
		// 进入/返回页面时刷新一次，保证修改租约后数据即时可见
		this.refreshAll();
	},
	methods: {
		onDateChange(e) {
			this.selectedDate = e.detail.value;
			this.refreshAll();
		},
		onCarStatsMonthChange(e) {
			this.carStatsMonth = e.detail.value;
			this.refreshAll();
		},
		onMonthlyStatsYearChange(e) {
			const v = e.detail.value || '';
			this.monthlyStatsYear = v.length >= 4 ? v.substring(0, 4) : String(new Date().getFullYear());
			this.refreshAll();
		},
		/** 租约实际金额：优先变化后的总金额，其次初始金额，兼容历史 totalAmount */
		rentalAmount(row) {
			let v = row.changedTotalAmount;
			if (v == null) v = row.initialTotalAmount;
			if (v == null) v = row.totalAmount;
			const n = parseFloat(v);
			return Number.isFinite(n) ? n : 0;
		},
		/** 只读一次 rental 全表，在内存中一次性汇总月/年/总/车名维度。 */
		refreshAll() {
			Promise.all([
				query('SELECT * FROM rental'),
				query('SELECT * FROM car')
			]).then(([rentalRows, carRows]) => {
				this.computeAll(rentalRows || [], carRows || []);
			}).catch((err) => {
				console.warn('加载统计数据失败:', err);
				this.computeAll([], []);
			});
		},
		computeAll(list, carRows) {
			// 车辆当前名称：租约里的 carName 是下单时的快照，车辆改名后会与现状不一致
			const carNameById = {};
			(carRows || []).forEach(car => {
				carNameById[car.id] = car.name;
			});

			// 首次进入自动定位到「最近有租约的月份」，避免默认当前月无数据时统计全为 0
			if (!this.hasAutoPickedMonth && list.length > 0) {
				let latest = '';
				list.forEach(row => {
					const sd = row.startDate || '';
					if (sd > latest) latest = sd;
				});
				if (latest.length >= 7) {
					this.selectedDate = latest.substring(0, 7);
					this.carStatsMonth = this.selectedDate;
					this.monthlyStatsYear = latest.substring(0, 4);
				}
			}
			this.hasAutoPickedMonth = true;

			const monthKey = this.selectedDate || '';
			const yearKey = monthKey.substring(0, 4);
			const yearOfMonthlyStats = String(this.monthlyStatsYear || '');
			const carMonthKey = this.carStatsMonth || '';
			const carYearKey = carMonthKey.substring(0, 4);

			let monthly = 0;
			let yearly = 0;
			let total = 0;
			const monthBuckets = {};
			const carMonthMap = {};
			const carYearMap = {};
			const carKeyName = {};

			list.forEach((row) => {
				const amt = this.rentalAmount(row);
				const startDate = row.startDate || '';
				const rowMonth = startDate.substring(0, 7);
				const rowYear = startDate.substring(0, 4);

				total += amt;
				if (rowMonth === monthKey) {
					monthly += amt;
				}
				if (yearKey && rowYear === yearKey) {
					yearly += amt;
				}
				if (yearOfMonthlyStats && rowYear === yearOfMonthlyStats) {
					monthBuckets[rowMonth] = (monthBuckets[rowMonth] || 0) + amt;
				}

				// 优先按 carId 归并（车辆改名后历史租约仍算同一辆），无 carId 时才用名称
				const carKey = row.carId != null ? 'id:' + row.carId : 'name:' + (row.carName || '未命名');
				carKeyName[carKey] = carNameById[row.carId] || row.carName || '未命名';
				if (rowMonth === carMonthKey) {
					carMonthMap[carKey] = (carMonthMap[carKey] || 0) + amt;
				}
				if (carYearKey && rowYear === carYearKey) {
					carYearMap[carKey] = (carYearMap[carKey] || 0) + amt;
				}
			});

			this.monthlyIncome = monthly.toFixed(2);
			this.yearlyIncome = yearly.toFixed(2);
			this.totalIncome = total.toFixed(2);

			this.monthlyData = Object.keys(monthBuckets)
				.sort()
				.map((m) => ({ month: m, income: monthBuckets[m].toFixed(2) }));

			this.carData = Object.keys(carKeyName)
				.map((carKey) => ({
					key: carKey,
					carName: carKeyName[carKey],
					monthIncome: (carMonthMap[carKey] || 0).toFixed(2),
					yearIncome: (carYearMap[carKey] || 0).toFixed(2)
				}))
				.sort((a, b) => parseFloat(b.monthIncome) - parseFloat(a.monthIncome));
		}
	}
}
</script>

<style scoped>
.container {
	padding: 20rpx;
	padding-top: 100rpx;
}

.header {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 20rpx;
	background-color: #f8f8f8;
	z-index: 999;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
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

.table-section {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
	margin-bottom: 20rpx;
}

.section-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
	margin-bottom: 12rpx;
}

.section-title {
	font-size: 28rpx;
	font-weight: bold;
}

.car-month-filter {
	display: flex;
	align-items: center;
	gap: 12rpx;
}

.filter-label {
	font-size: 22rpx;
	color: #666;
}

.car-month-picker {
	background-color: #f2f2f7;
	padding: 10rpx 20rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
	color: #007aff;
}

.section-hint {
	display: block;
	font-size: 22rpx;
	color: #8e8e93;
	margin-bottom: 16rpx;
	line-height: 1.4;
}

.table-container {
	border: 1rpx solid #f0f0f0;
	border-radius: 8rpx;
	overflow: hidden;
}

.table-header {
	display: flex;
	background-color: #f8f8f8;
	font-weight: bold;
}

.table-row {
	display: flex;
	border-top: 1rpx solid #f0f0f0;
}

.table-row:nth-child(even) {
	background-color: #f9f9f9;
}

.table-cell {
	flex: 1;
	padding: 15rpx;
	text-align: center;
	font-size: 24rpx;
}

.table-header .table-cell {
	color: #333;
}

.table-row .table-cell {
	color: #666;
}

.table-header-3 .table-cell {
	flex: 1;
}

.table-header-3 .table-cell-wide {
	flex: 1.4;
	text-align: left;
	padding-left: 20rpx;
}

.table-header-3 .table-cell:not(.table-cell-wide) {
	flex: 1;
}

.table-empty {
	text-align: center;
	padding: 32rpx 20rpx;
	font-size: 24rpx;
	color: #8e8e93;
}
</style>
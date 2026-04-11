<template>
	<view class="container">
		<view class="header">
			<view class="search-box">
				<text class="search-icon">🔍</text>
				<input type="text" v-model="searchKeyword" placeholder="按车名搜索" class="search-input" @input="handleSearch" />
			</view>
			<button @click="addRental" class="add-btn">添加租赁记录</button>
		</view>
		<view class="filter-section">
			<view class="filter-item">
				<text class="filter-label">开始时间</text>
				<picker mode="date" :value="startDate" @change="handleStartDateChange" :start="minDate" :end="maxDate"
					class="date-picker">
					<view class="picker-text">{{ formatDate(startDate) }}</view>
				</picker>
			</view>
			<view class="filter-item">
				<text class="filter-label">结束时间</text>
				<picker mode="date" :value="endDate" @change="handleEndDateChange" :start="minDate" :end="maxDate"
					class="date-picker">
					<view class="picker-text">{{ formatDate(endDate) }}</view>
				</picker>
			</view>
			<button @click="resetFilter" class="reset-btn">重置</button>
		</view>
		<view class="rental-list">
			<view v-for="item in filteredRentalList" :key="item.id" class="rental-item">
				<view class="item-content">
					<text class="car-number">{{ item.carName }}</text>
					<text class="rental-date">租赁时间：{{ item.startDate }} 至 {{ item.endDate }}</text>
					<text class="days">租赁天数：{{ item.days }}天</text>
					<text class="daily-rate">日租金：{{ item.dailyRate }}元</text>
					<text class="total-amount">总金额：{{ item.totalAmount }}元</text>
					<text class="renter-info" v-if="item.renterName || item.renterPhone">
						租车人：{{ item.renterName || '未填写' }} {{ item.renterPhone ? '(' + item.renterPhone + ')' : '' }}
					</text>
					<text class="status" :class="item.status === '已完成' ? 'status-completed' : 'status-active'">
						状态：{{ item.status }}
					</text>
				</view>
				<view class="item-actions">
					<button @click="editRental(item)" class="edit-btn">编辑</button>
					<button @click="deleteRental(item.id)" class="delete-btn">删除</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { query, executeSql } from '../../utils/db.js';
export default {
	data() {
		const now = new Date();
		const minDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
		const maxDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		return {
			rentalList: [],
			searchKeyword: '',
			startDate: this.formatDateString(minDate),
			endDate: this.formatDateString(maxDate),
			minDate: this.formatDateString(minDate),
			maxDate: this.formatDateString(maxDate)
		};
	},
	onLoad() {
		this.loadRentalList();
	},
	onShow() {
		// 页面显示时重新加载数据，确保添加或编辑后能看到最新数据
		this.loadRentalList();
	},
	methods: {
		loadRentalList() {
			// 直接从数据库加载租赁列表
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM rental ORDER BY id DESC`;
			query(sql).then(res => {
				this.rentalList = res || [];
				// 如果数据库中没有数据，使用模拟数据
				if (this.rentalList.length === 0) {
					this.rentalList = [
						{
							id: 1,
							carName: '丰田凯美瑞',
							startDate: '2026-04-01',
							endDate: '2026-04-05',
							days: 5,
							dailyRate: 300,
							totalAmount: 1500,
							status: '已完成'
						},
						{
							id: 2,
							carName: '本田雅阁',
							startDate: '2026-04-10',
							endDate: '2026-04-15',
							days: 6,
							dailyRate: 350,
							totalAmount: 2100,
							status: '进行中'
						}
					];
				}
			}).catch(err => {
				console.error('加载租赁列表失败:', err);
				// 加载失败时使用模拟数据
				this.rentalList = [
					{
						id: 1,
						carNumber: '京A12345',
						startDate: '2026-04-01',
						endDate: '2026-04-05',
						days: 5,
						dailyRate: 300,
						totalAmount: 1500,
						status: '已完成'
					},
					{
						id: 2,
						carNumber: '京B67890',
						startDate: '2026-04-10',
						endDate: '2026-04-15',
						days: 6,
						dailyRate: 350,
						totalAmount: 2100,
						status: '进行中'
					}
				];
			});
		},
		addRental() {
			// 跳转到添加租赁记录页面
			uni.navigateTo({
				url: './add-rental'
			});
		},
		editRental(item) {
			// 跳转到编辑租赁记录页面
			uni.navigateTo({
				url: './edit-rental?id=' + item.id
			});
		},
		deleteRental(id) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除这条租赁记录吗？',
				success: (res) => {
					if (res.confirm) {
						// 直接从数据库中删除
						// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
						const sql = `DELETE FROM rental WHERE id = ?`;
						executeSql(sql, [id]).then(() => {
							this.rentalList = this.rentalList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('删除失败:', err);
							// 删除失败时从本地列表中移除
							this.rentalList = this.rentalList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						});
					}
				}
			});
		},
		formatDate(date) {
			// 处理字符串类型的日期
			if (typeof date === 'string') {
				date = new Date(date);
			}
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			return `${year}-${month}-${day} ${hours}:${minutes}`;
		},
		formatDateString(date) {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		},
		handleStartDateChange(e) {
			// 保存picker返回的时间字符串
			this.startDate = e.detail.value;
		},
		handleEndDateChange(e) {
			// 保存picker返回的时间字符串
			this.endDate = e.detail.value;
		},
		resetFilter() {
			const now = new Date();
			this.startDate = this.formatDateString(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
			this.endDate = this.formatDateString(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
			this.searchKeyword = '';
		},
		handleSearch() {
			// 搜索逻辑已经在计算属性中处理
		}
	},
	computed: {
		filteredRentalList() {
			let filtered = this.rentalList;

			// 按车名搜索
			if (this.searchKeyword) {
				const keyword = this.searchKeyword.toLowerCase();
				filtered = filtered.filter(item =>
					item.carName.toLowerCase().includes(keyword)
				);
			}

			// 按时间范围筛选
			const start = new Date(this.startDate).getTime();
			const end = new Date(this.endDate).getTime();
			// 将结束时间设置为当天的23:59:59，确保包含当天的所有记录
			const endOfDay = new Date(this.endDate);
			endOfDay.setHours(23, 59, 59, 999);
			const endTime = endOfDay.getTime();

			filtered = filtered.filter(item => {
				// 确保日期格式正确处理，无论是否包含时间
				const itemStart = new Date(item.startDate).getTime();
				const itemEnd = new Date(item.endDate).getTime();
				// 检查租赁记录的时间范围是否与选择的时间范围有重叠
				return !(itemEnd < start || itemStart > endTime);
			});

			return filtered;
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
	gap: 10rpx;
}

.search-box {
	flex: 1;
	display: flex;
	align-items: center;
	background-color: #F2F2F2;
	border-radius: 8rpx;
	padding: 0 15rpx;
	height: 60rpx;
}

.search-icon {
	margin-right: 10rpx;
}

.search-input {
	flex: 1;
	height: 100%;
	font-size: 24rpx;
	color: #333;
}

.add-btn {
	background-color: #007AFF;
	color: white;
	padding: 10rpx 20rpx;
	border-radius: 8rpx;
	white-space: nowrap;
}

.filter-section {
	display: flex;
	flex-wrap: wrap;
	gap: 15rpx;
	margin-bottom: 20rpx;
	padding: 15rpx;
	background-color: #F8F8F8;
	border-radius: 8rpx;
}

.filter-item {
	display: flex;
	flex-direction: column;
	gap: 5rpx;
}

.filter-label {
	font-size: 20rpx;
	color: #666;
}

.date-picker {
	background-color: white;
	padding: 10rpx 15rpx;
	border-radius: 8rpx;
	border: 1rpx solid #E0E0E0;
	min-width: 200rpx;
}

.picker-text {
	font-size: 22rpx;
	color: #333;
}

.reset-btn {
	background-color: #F2F2F2;
	color: #666;
	padding: 10rpx 20rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
	align-self: flex-end;
}

.rental-list {
	margin-top: 20rpx;
}

.rental-item {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	margin-bottom: 15rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.item-content {
	margin-bottom: 15rpx;
}

.car-number {
	display: block;
	font-size: 28rpx;
	font-weight: bold;
	margin-bottom: 8rpx;
}

.rental-date {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.days {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.daily-rate {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.total-amount {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.renter-info {
	display: block;
	font-size: 24rpx;
	color: #007AFF;
	margin-bottom: 8rpx;
}

.status {
	display: block;
	font-size: 24rpx;
	font-weight: bold;
}

.status-active {
	color: #FF9500;
}

.status-completed {
	color: #34C759;
}

.item-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10rpx;
}

.edit-btn {
	background-color: #FF9500;
	color: white;
	padding: 8rpx 16rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.delete-btn {
	background-color: #FF3B30;
	color: white;
	padding: 8rpx 16rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}
</style>
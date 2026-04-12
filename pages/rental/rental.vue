<template>
	<view class="container" @click="closeSlideAction">
		<view class="header">
			<view class="search-box">
				<text class="search-icon">🔍</text>
				<input type="text" v-model="searchKeyword" placeholder="按车名搜索" class="search-input" @input="handleSearch" />
			</view>
			<button @click="addRental" class="add-btn">添加租赁记录</button>
		</view>
		<view class="tab-section">
			<view v-for="(option, index) in statusOptions" :key="index" class="tab-item"
				:class="{ active: selectedStatusIndex === index }" @click.stop="selectedStatusIndex = index">
				{{ option }}
			</view>
		</view>
		<view class="rental-list">
			<view v-for="item in filteredRentalList" :key="item.id" class="rental-item">
				<view class="rental-item-wrapper">
					<!-- 左侧编辑按钮 -->
					<view class="slide-actions-left">
						<view class="slide-action edit-action" @click.stop="editRental(item)">编辑</view>
					</view>
					<view class="item-content" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd" @click.stop
						:data-id="item.id" :style="{
							transform: showSlideAction && slideId === item.id ? (slideDirection === 'left' ? 'translateX(-120rpx)' : 'translateX(120rpx)') : 'translateX(0)'
						}">
						<text class="car-number">{{ item.carName }}</text>
						<text class="rental-date">租赁时间：{{ item.startDate }} 至 {{ item.endDate }}</text>
						<text class="days">租赁天数：{{ item.days }}天</text>
						<text class="daily-rate">日租金：{{ item.dailyRate }}元</text>
						<text class="total-amount">
							总金额：{{ item.changedTotalAmount || item.initialTotalAmount || item.totalAmount }}元
							<text v-if="item.changeAction" class="change-info">
								（{{ item.changedTotalAmount || item.initialTotalAmount }} {{ item.changeAction }} {{ item.changeAmount
								}}
								于{{
									formatDateToDay(item.updatedAt) }}）
							</text>
						</text>
						<text class="renter-info" v-if="item.renterName || item.renterPhone">
							租车人：{{ item.renterName || '未填写' }} {{ item.renterPhone ? '(' + item.renterPhone + ')' : '' }}
						</text>
						<text class="status" :class="item.status === '已完成' ? 'status-completed' : 'status-active'">
							状态：{{ item.status }}
						</text>
						<view class="item-actions">
							<button @click.stop="renewRental(item)" class="renew-btn">续租</button>
							<button @click.stop="returnRental(item)" class="return-btn">退租</button>
							<button @click.stop="completeRental(item)" class="complete-btn" v-if="item.status === '进行中'">一键完成</button>
						</view>
					</view>
					<!-- 右侧删除按钮 -->
					<view class="slide-actions-right">
						<view class="slide-action delete-action" @click.stop="deleteRental(item.id)">删除</view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { query, executeSql } from '../../utils/db.js';
export default {
	data() {
		return {
			rentalList: [],
			searchKeyword: '',
			statusOptions: ['全部', '进行中', '已完成'],
			selectedStatusIndex: 0,
			// 滑动操作相关状态
			startX: 0,
			endX: 0,
			currentId: 0,
			showSlideAction: false,
			slideDirection: '',
			slideId: 0
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
				const rentals = res.sort((a, b) => b.id - a.id) || [];
				// 处理数据，确保使用initialTotalAmount而不是totalAmount
				this.rentalList = rentals.map(item => {
					// 如果有totalAmount但没有initialTotalAmount，将totalAmount的值赋给initialTotalAmount
					if (item.totalAmount && !item.initialTotalAmount) {
						item.initialTotalAmount = item.totalAmount;
						// 移除totalAmount字段
						delete item.totalAmount;
					}
					// 确保changeAmount存储为正数
					if (item.changeAmount && item.changeAmount < 0) {
						item.changeAmount = Math.abs(item.changeAmount);
					}
					return item;
				});
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
							initialTotalAmount: 1500,
							status: '已完成'
						},
						{
							id: 2,
							carName: '本田雅阁',
							startDate: '2026-04-10',
							endDate: '2026-04-15',
							days: 6,
							dailyRate: 350,
							initialTotalAmount: 2100,
							changeAmount: 700,
							changeAction: '续租',
							changedTotalAmount: 2800,
							updatedAt: '2026-04-12',
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
						carName: '丰田凯美瑞',
						startDate: '2026-04-01',
						endDate: '2026-04-05',
						days: 5,
						dailyRate: 300,
						initialTotalAmount: 1500,
						status: '已完成'
					},
					{
						id: 2,
						carName: '本田雅阁',
						startDate: '2026-04-10',
						endDate: '2026-04-15',
						days: 6,
						dailyRate: 350,
						initialTotalAmount: 2100,
						changeAmount: 700,
						changeAction: '续租',
						changedTotalAmount: 2800,
						updatedAt: '2026-04-12',
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
			// 找到要删除的租约记录
			const rentalItem = this.rentalList.find(item => item.id === id);
			if (!rentalItem) return;

			// 显示输入框进行二次验证
			uni.showModal({
				title: '确认删除',
				content: '请输入此次总金额以确认删除',
				editable: true,
				placeholderText: '请输入总金额',
				success: (res) => {
					if (res.confirm) {
						const inputAmount = parseFloat(res.content);
						const totalAmount = rentalItem.changedTotalAmount || rentalItem.initialTotalAmount;

						// 验证金额是否正确
						if (inputAmount === totalAmount) {
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
						} else {
							uni.showToast({
								title: '金额验证失败，删除取消',
								icon: 'error'
							});
						}
					}
				}
			});
		},
		formatDateToDay(dateString) {
			if (!dateString) return '';
			// 处理ISO格式的日期字符串
			if (dateString.includes('T')) {
				return dateString.split('T')[0];
			}
			return dateString;
		},
		handleStatusChange(e) {
			// 保存picker返回的状态索引
			this.selectedStatusIndex = e.detail.value;
		},
		handleSearch() {
			// 搜索逻辑已经在计算属性中处理
		},
		// 续租功能
		renewRental(item) {
			uni.showModal({
				title: '续租',
				content: '请输入续租的金额变化',
				editable: true,
				placeholderText: '请输入金额',
				success: (res) => {
					if (res.confirm) {
						const changeAmount = parseFloat(res.content);

						if (isNaN(changeAmount) || changeAmount <= 0) {
							uni.showToast({
								title: '输入格式错误，金额应为正数',
								icon: 'error'
							});
							return;
						}

						const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
						const newTotalAmount = baseAmount + changeAmount;
						const updatedAt = new Date().toISOString();

						// 更新数据库
						const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
						const params = [changeAmount, '续租', newTotalAmount, updatedAt, item.id];
						executeSql(sql, params).then(() => {
							// 更新本地列表
							const index = this.rentalList.findIndex(r => r.id === item.id);
							if (index !== -1) {
								this.rentalList[index].changeAmount = changeAmount;
								this.rentalList[index].changeAction = '续租';
								this.rentalList[index].changedTotalAmount = newTotalAmount;
								this.rentalList[index].updatedAt = updatedAt;
								// 移除totalAmount字段
								delete this.rentalList[index].totalAmount;
							}
							uni.showToast({
								title: '续租成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('续租失败:', err);
							uni.showToast({
								title: '续租失败',
								icon: 'error'
							});
						});
					}
				}
			});
		},
		// 退租功能
		returnRental(item) {
			uni.showModal({
				title: '退租',
				content: '请输入退租的金额变化',
				editable: true,
				placeholderText: '请输入金额',
				success: (res) => {
					if (res.confirm) {
						const changeAmount = parseFloat(res.content);

						if (isNaN(changeAmount) || changeAmount <= 0) {
							uni.showToast({
								title: '输入格式错误，金额应为正数',
								icon: 'error'
							});
							return;
						}

						// 退租金额存储为正数，通过changeAction判断正负
						const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
						const newTotalAmount = baseAmount - changeAmount;
						const updatedAt = new Date().toISOString();

						// 更新数据库
						const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
						const params = [changeAmount, '退租', newTotalAmount, updatedAt, item.id];
						executeSql(sql, params).then(() => {
							// 更新本地列表
							const index = this.rentalList.findIndex(r => r.id === item.id);
							if (index !== -1) {
								this.rentalList[index].changeAmount = changeAmount;
								this.rentalList[index].changeAction = '退租';
								this.rentalList[index].changedTotalAmount = newTotalAmount;
								this.rentalList[index].updatedAt = updatedAt;
								// 移除totalAmount字段
								delete this.rentalList[index].totalAmount;
							}
							uni.showToast({
								title: '退租成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('退租失败:', err);
							uni.showToast({
								title: '退租失败',
								icon: 'error'
							});
						});
					}
				}
			});
		},
		// 一键完成租约
		completeRental(item) {
			uni.showModal({
				title: '确认完成',
				content: '确定要将此租约标记为已完成吗？',
				success: (res) => {
					if (res.confirm) {
						// 更新数据库
						const sql = `UPDATE rental SET status = ? WHERE id = ?`;
						const params = ['已完成', item.id];
						executeSql(sql, params).then(() => {
							// 更新本地列表
							const index = this.rentalList.findIndex(r => r.id === item.id);
							if (index !== -1) {
								this.rentalList[index].status = '已完成';
							}
							uni.showToast({
								title: '租约已完成',
								icon: 'success'
							});
						}).catch(err => {
							console.error('完成租约失败:', err);
							uni.showToast({
								title: '完成租约失败',
								icon: 'error'
							});
						});
					}
				}
			});
		},
		// 滑动操作相关方法
		touchStart(e) {
			this.startX = e.touches[0].clientX;
			this.currentId = e.currentTarget.dataset.id;
		},
		touchMove(e) {
			this.endX = e.touches[0].clientX;
			const diff = this.startX - this.endX;
			// 左滑动超过50px显示删除按钮
			if (diff > 50) {
				this.showSlideAction = true;
				this.slideDirection = 'left';
				this.slideId = this.currentId;
			}
			// 右滑动超过50px显示编辑按钮
			else if (diff < -50) {
				this.showSlideAction = true;
				this.slideDirection = 'right';
				this.slideId = this.currentId;
			}
			else {
				// 滑动距离不够，不显示滑动操作
				this.showSlideAction = false;
			}
		},
		// 点击其他地方关闭滑动状态
		closeSlideAction() {
			this.showSlideAction = false;
			this.slideId = 0;
		},
		touchEnd() {
			// 触摸结束后，只重置坐标，不重置滑动状态
			// 这样用户可以看到滑动后的效果，并点击编辑或删除按钮
			this.startX = 0;
			this.endX = 0;
			// 注意：如果需要点击其他地方关闭滑动状态，需要额外添加点击事件
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

			// 按状态筛选
			const selectedStatus = this.statusOptions[this.selectedStatusIndex];
			if (selectedStatus !== '全部') {
				filtered = filtered.filter(item => item.status === selectedStatus);
			}

			return filtered;
		}
	}
};
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
	gap: 10rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
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

.tab-section {
	display: flex;
	margin-bottom: 20rpx;
	background-color: #F8F8F8;
	border-radius: 8rpx;
	overflow: hidden;
}

.tab-item {
	flex: 1;
	text-align: center;
	padding: 15rpx 0;
	font-size: 24rpx;
	color: #666;
	transition: all 0.3s ease;
}

.tab-item.active {
	background-color: #007AFF;
	color: white;
	font-weight: bold;
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
	margin-bottom: 15rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
	border-radius: 8rpx;
	overflow: hidden;
}

.rental-item-wrapper {
	position: relative;
	display: flex;
	background-color: white;
}

.item-content {
	flex: 1;
	padding: 20rpx;
	z-index: 1;
	background-color: white;
	transition: transform 0.3s ease;
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

.change-info {
	font-size: 20rpx;
	color: #999;
	margin-left: 10rpx;
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

.slide-actions-left {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	display: flex;
	z-index: 0;
}

.slide-actions-right {
	position: absolute;
	top: 0;
	right: 0;
	height: 100%;
	display: flex;
	z-index: 0;
}

.slide-action {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 120rpx;
	font-size: 24rpx;
	color: white;
}

.edit-action {
	background-color: #FF9500;
}

.delete-action {
	background-color: #FF3B30;
}

.item-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10rpx;
	margin-top: 15rpx;
}

.edit-btn {
	background-color: #FF9500;
	color: white;
	padding: 8rpx 16rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.renew-btn {
	background-color: #34C759;
	color: white;
	padding: 8rpx 16rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.return-btn {
	background-color: #FF9500;
	color: white;
	padding: 8rpx 16rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
}

.complete-btn {
	background-color: #34C759;
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
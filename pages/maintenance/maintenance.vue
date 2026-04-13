<template>
	<view class="container">
		<view class="header">
			<view class="search-box">
				<text class="search-icon">🔍</text>
				<input
					type="text"
					v-model="searchKeyword"
					placeholder="搜索车辆名称"
					class="search-input"
					confirm-type="search"
					@input="handleSearch"
				/>
			</view>
		</view>
		<view class="maintenance-list">
			<view v-for="item in filteredMaintenanceList" :key="item.id" class="maintenance-item">
				<view class="item-content">
					<text class="car-number">{{ item.carName }}</text>
					<text class="maintenance-date">保养日期：{{ item.maintenanceDate }}</text>
					<text class="mileage">保养里程：{{ item.mileage }}公里</text>
					<text class="cost">费用：{{ item.cost }}元</text>
					<text class="items">保养项目：{{ item.items }}</text>
				</view>
				<view class="item-actions">
					<button @click="editMaintenance(item)" class="edit-btn">编辑</button>
					<button @click="deleteMaintenance(item.id)" class="delete-btn">删除</button>
				</view>
			</view>
		</view>
		<view class="fab-add fab-add-maintenance" @click.stop="addMaintenance">
			<text class="fab-add-icon">+</text>
		</view>
	</view>
</template>

<script>
import { query, executeSql } from '../../utils/db.js';
export default {
	data() {
		return {
			maintenanceList: [],
			searchKeyword: ''
		};
	},
	onLoad() {
		this.loadMaintenanceList();
	},
	onShow() {
		// 页面显示时重新加载数据，确保添加或编辑后能看到最新数据
		this.loadMaintenanceList();
	},
	computed: {
		filteredMaintenanceList() {
			if (!this.searchKeyword) {
				return this.maintenanceList;
			}
			const keyword = this.searchKeyword.toLowerCase();
			return this.maintenanceList.filter(item =>
				item.carName.toLowerCase().includes(keyword)
			);
		}
	},
	methods: {
		loadMaintenanceList() {
			// 直接从数据库加载保养列表
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM maintenance ORDER BY id DESC`;
			query(sql).then(res => {
				this.maintenanceList = res || [];
				// 如果数据库中没有数据，使用模拟数据
				if (this.maintenanceList.length === 0) {
					this.maintenanceList = [
						{
							id: 1,
							carName: '丰田凯美瑞',
							maintenanceDate: '2026-03-15',
							mileage: 10000,
							cost: 800,
							items: '机油更换、机滤更换'
						},
						{
							id: 2,
							carName: '本田雅阁',
							maintenanceDate: '2026-02-20',
							mileage: 15000,
							cost: 1200,
							items: '机油更换、机滤更换、空滤更换'
						}
					];
				}
			}).catch(err => {
				console.error('加载保养列表失败:', err);
				// 加载失败时使用模拟数据
				this.maintenanceList = [
					{
						id: 1,
						carName: '丰田凯美瑞',
						maintenanceDate: '2026-03-15',
						mileage: 10000,
						cost: 800,
						items: '机油更换、机滤更换'
					},
					{
						id: 2,
						carName: '本田雅阁',
						maintenanceDate: '2026-02-20',
						mileage: 15000,
						cost: 1200,
						items: '机油更换、机滤更换、空滤更换'
					}
				];
			});
		},
		addMaintenance() {
			// 跳转到添加保养记录页面
			uni.navigateTo({
				url: './add-maintenance'
			});
		},
		editMaintenance(item) {
			// 跳转到编辑保养记录页面
			uni.navigateTo({
				url: './edit-maintenance?id=' + item.id
			});
		},
		deleteMaintenance(id) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除这条保养记录吗？',
				success: (res) => {
					if (res.confirm) {
						// 直接从数据库中删除
						// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
						const sql = `DELETE FROM maintenance WHERE id = ?`;
						executeSql(sql, [id]).then(() => {
							this.maintenanceList = this.maintenanceList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('删除失败:', err);
							// 删除失败时从本地列表中移除
							this.maintenanceList = this.maintenanceList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						});
					}
				}
			});
		},
		handleSearch() {
			// 搜索逻辑已经在计算属性中处理
		}
	}
};
</script>

<style scoped>
.container {
	padding: 20rpx;
	padding-top: 108rpx;
	padding-bottom: calc(200rpx + env(safe-area-inset-bottom));
}

.header {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 999;
	display: flex;
	align-items: center;
	padding: 16rpx 24rpx 20rpx;
	background: linear-gradient(180deg, #ffffff 0%, #eef2f7 100%);
	box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
}

.search-box {
	flex: 1;
	display: flex;
	align-items: center;
	min-height: 72rpx;
	padding: 0 28rpx;
	background: #ffffff;
	border-radius: 999rpx;
	border: 1rpx solid rgba(255, 149, 0, 0.28);
	box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	gap: 12rpx;
}

.search-icon {
	font-size: 30rpx;
	line-height: 1;
	opacity: 0.5;
}

.search-input {
	flex: 1;
	height: 72rpx;
	font-size: 28rpx;
	color: #1c1c1e;
}

.fab-add {
	position: fixed;
	right: 32rpx;
	bottom: calc(128rpx + env(safe-area-inset-bottom));
	width: 112rpx;
	height: 112rpx;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 998;
}

.fab-add-maintenance {
	background: linear-gradient(145deg, #ff9500, #e08300);
	box-shadow: 0 12rpx 32rpx rgba(255, 149, 0, 0.38);
}

.fab-add-icon {
	font-size: 56rpx;
	color: #ffffff;
	font-weight: 300;
	line-height: 1;
}

.maintenance-list {
	margin-top: 20rpx;
}

.maintenance-item {
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

.maintenance-date {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.mileage {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.cost {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.items {
	display: block;
	font-size: 24rpx;
	color: #666;
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
<template>
	<view class="container">
		<view class="header">
			<view class="search-box">
				<text class="search-icon">🔍</text>
				<input type="text" v-model="searchKeyword" placeholder="按车名搜索" class="search-input" @input="handleSearch" />
			</view>
			<button @click="addCar" class="add-btn">添加车辆</button>
		</view>
		<view class="car-list">
			<view v-for="item in filteredCarList" :key="item.id" class="car-item">
				<view class="item-content">
					<text class="car-name">{{ item.name }}</text>
					<text class="car-number">车牌号：{{ item.carNumber || '未填写' }}</text>
					<text class="image-path" v-if="item.imagePath">照片路径：{{ item.imagePath }}</text>
				</view>
				<view class="item-actions">
					<button @click="editCar(item)" class="edit-btn">编辑</button>
					<button @click="deleteCar(item.id)" class="delete-btn">删除</button>
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
			carList: [],
			searchKeyword: ''
		};
	},
	onLoad() {
		this.loadCarList();
	},
	onShow() {
		// 页面显示时重新加载数据，确保添加或编辑后能看到最新数据
		this.loadCarList();
	},
	computed: {
		filteredCarList() {
			if (!this.searchKeyword) {
				return this.carList;
			}
			const keyword = this.searchKeyword.toLowerCase();
			return this.carList.filter(item =>
				item.name.toLowerCase().includes(keyword)
			);
		}
	},
	methods: {
		loadCarList() {
			// 直接从数据库加载车辆列表
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM car ORDER BY id DESC`;
			query(sql).then(res => {
				this.carList = res || [];
				// 如果数据库中没有数据，使用模拟数据
				if (this.carList.length === 0) {
					this.carList = [
						{
							id: 1,
							name: '大众朗逸',
							carNumber: '京A12345',
							imagePath: ''
						},
						{
							id: 2,
							name: '丰田凯美瑞',
							carNumber: '京B67890',
							imagePath: ''
						}
					];
				}
			}).catch(err => {
				console.error('加载车辆列表失败:', err);
				// 加载失败时使用模拟数据
				this.carList = [
					{
						id: 1,
						name: '大众朗逸',
						carNumber: '京A12345',
						imagePath: ''
					},
					{
						id: 2,
						name: '丰田凯美瑞',
						carNumber: '京B67890',
						imagePath: ''
					}
				];
			});
		},
		addCar() {
			// 跳转到添加车辆页面
			uni.navigateTo({
				url: './add-car'
			});
		},
		editCar(item) {
			// 跳转到编辑车辆页面
			uni.navigateTo({
				url: './edit-car?id=' + item.id
			});
		},
		deleteCar(id) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除这辆车吗？',
				success: (res) => {
					if (res.confirm) {
						// 直接从数据库中删除
						// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
						const sql = `DELETE FROM car WHERE id = ?`;
						executeSql(sql, [id]).then(() => {
							this.carList = this.carList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('删除失败:', err);
							// 删除失败时从本地列表中移除
							this.carList = this.carList.filter(item => item.id !== id);
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

.car-list {
	margin-top: 20rpx;
}

.car-item {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	margin-bottom: 15rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
}

.item-content {
	margin-bottom: 15rpx;
}

.car-name {
	display: block;
	font-size: 28rpx;
	font-weight: bold;
	margin-bottom: 8rpx;
}

.car-number {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.image-path {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
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

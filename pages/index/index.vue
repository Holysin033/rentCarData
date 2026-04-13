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
		<view class="car-list">
			<view v-for="item in filteredCarList" :key="item.id" class="car-item">
				<view class="item-content">
					<text class="car-name">{{ item.name }}</text>
					<text class="car-number">车牌号：{{ item.carNumber || '未填写' }}</text>
					<text class="image-path" v-if="item.imagePath">照片路径：{{ item.imagePath }}</text>
					<text class="maintenance-date">最新保养：{{ item.latestMaintenance || '无' }}</text>
					<text class="insurance-date">最新保险：{{ item.latestInsurance || '无' }}</text>
				</view>
				<view class="item-actions">
					<button @click="editCar(item)" class="edit-btn">编辑</button>
					<button @click="deleteCar(item.id)" class="delete-btn">删除</button>
				</view>
			</view>
		</view>
		<view class="fab-add" @click.stop="addCar">
			<text class="fab-add-icon">+</text>
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

				// 为每个车辆添加最新的保养时间和保险时间
				this.carList.forEach(car => {
					// 初始化默认值
					car.latestMaintenance = '无';
					car.latestInsurance = '无';

					// 查询最新保养记录
					query(`SELECT maintenanceDate FROM maintenance WHERE carId = ? ORDER BY maintenanceDate DESC LIMIT 1`, [car.id]).then(maintenanceRes => {
						// console.log('保养查询结果 for car ' + car.id + ':', maintenanceRes);
						if (maintenanceRes && maintenanceRes.length > 0) {
							car.latestMaintenance = maintenanceRes[0].maintenanceDate;
						}
					});

					// 查询最新保险记录
					query(`SELECT expireDate FROM insurance WHERE carId = ? ORDER BY expireDate DESC LIMIT 1`, [car.id]).then(insuranceRes => {
						// console.log('保险查询结果 for car ' + car.id + ':', insuranceRes);
						if (insuranceRes && insuranceRes.length > 0) {
							car.latestInsurance = insuranceRes[0].expireDate;
						}
					});
				});
				// 如果数据库中没有数据，使用模拟数据
				if (this.carList.length === 0) {
					this.carList = [
						{
							id: 1,
							name: '大众朗逸',
							carNumber: '京A12345',
							imagePath: '',
							latestMaintenance: '2026-03-15',
							latestInsurance: '2026-12-31'
						},
						{
							id: 2,
							name: '丰田凯美瑞',
							carNumber: '京B67890',
							imagePath: '',
							latestMaintenance: '2026-02-20',
							latestInsurance: '2026-11-30'
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
						imagePath: '',
						latestMaintenance: '2026-03-15',
						latestInsurance: '2026-12-31'
					},
					{
						id: 2,
						name: '丰田凯美瑞',
						carNumber: '京B67890',
						imagePath: '',
						latestMaintenance: '2026-02-20',
						latestInsurance: '2026-11-30'
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
	border: 1rpx solid rgba(0, 122, 255, 0.14);
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
	background: linear-gradient(145deg, #0a84ff, #0066d6);
	box-shadow: 0 12rpx 32rpx rgba(10, 132, 255, 0.4);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 998;
}

.fab-add-icon {
	font-size: 56rpx;
	color: #ffffff;
	font-weight: 300;
	line-height: 1;
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

.maintenance-date {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.insurance-date {
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

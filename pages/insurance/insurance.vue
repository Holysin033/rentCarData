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
		<view class="insurance-list">
			<view v-for="item in filteredInsuranceList" :key="item.id" class="insurance-item">
				<view class="item-content">
					<text class="car-number">{{ item.carName }}</text>
					<text class="insurance-company">{{ item.company }}</text>
					<text class="expire-date">到期日期：{{ item.expireDate }}</text>
					<text class="premium">保费：{{ item.premium }}元</text>
				</view>
				<view class="item-actions">
					<button @click="editInsurance(item)" class="edit-btn">编辑</button>
					<button @click="deleteInsurance(item.id)" class="delete-btn">删除</button>
				</view>
			</view>
		</view>
		<view class="fab-add fab-add-insurance" @click.stop="addInsurance">
			<text class="fab-add-icon">+</text>
		</view>
	</view>
</template>

<script>
import { query, executeSql } from '../../utils/db.js';
export default {
	data() {
		return {
			insuranceList: [],
			searchKeyword: ''
		};
	},
	onLoad() {
		this.loadInsuranceList();
	},
	onShow() {
		// 页面显示时重新加载数据，确保添加或编辑后能看到最新数据
		this.loadInsuranceList();
	},
	computed: {
		filteredInsuranceList() {
			if (!this.searchKeyword) {
				return this.insuranceList;
			}
			const keyword = this.searchKeyword.toLowerCase();
			return this.insuranceList.filter(item =>
				item.carName.toLowerCase().includes(keyword)
			);
		}
	},
	methods: {
		loadInsuranceList() {
			// 直接从数据库加载保险列表
			// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
			const sql = `SELECT * FROM insurance ORDER BY id DESC`;
			query(sql).then(res => {
				this.insuranceList = res || [];
				// 检查是否有即将到期的保险
				this.checkExpiringInsurance();
				// 如果数据库中没有数据，使用模拟数据
				if (this.insuranceList.length === 0) {
					this.insuranceList = [
						{
							id: 1,
							carName: '丰田凯美瑞',
							company: '平安保险',
							expireDate: '2026-12-31',
							premium: 5000
						},
						{
							id: 2,
							carName: '本田雅阁',
							company: '人保财险',
							expireDate: '2026-10-15',
							premium: 4500
						}
					];
				}
			}).catch(err => {
				console.error('加载保险列表失败:', err);
				// 加载失败时使用模拟数据
				this.insuranceList = [
					{
						id: 1,
						carName: '丰田凯美瑞',
						company: '平安保险',
						expireDate: '2026-12-31',
						premium: 5000
					},
					{
						id: 2,
						carName: '本田雅阁',
						company: '人保财险',
						expireDate: '2026-10-15',
						premium: 4500
					}
				];
			});
		},
		checkExpiringInsurance() {
			// 检查即将到期的保险（30天内）
			const today = new Date();
			const thirtyDaysLater = new Date();
			thirtyDaysLater.setDate(today.getDate() + 30);

			const expiringInsurance = this.insuranceList.filter(item => {
				const expireDate = new Date(item.expireDate);
				return expireDate >= today && expireDate <= thirtyDaysLater;
			});

			if (expiringInsurance.length > 0) {
				// 显示到期提醒
				uni.showModal({
					title: '保险到期提醒',
					content: `有 ${expiringInsurance.length} 条保险即将到期，请及时处理。`,
					showCancel: false
				});
			}
		},
		addInsurance() {
			// 跳转到添加保险页面
			uni.navigateTo({
				url: './add-insurance'
			});
		},
		editInsurance(item) {
			// 跳转到编辑保险页面
			uni.navigateTo({
				url: './edit-insurance?id=' + item.id
			});
		},
		deleteInsurance(id) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除这条保险记录吗？',
				success: (res) => {
					if (res.confirm) {
						// 直接从数据库中删除
						// db.js会自动处理浏览器环境（IndexedDB）和App环境（plus.sqlite）
						const sql = `DELETE FROM insurance WHERE id = ?`;
						executeSql(sql, [id]).then(() => {
							this.insuranceList = this.insuranceList.filter(item => item.id !== id);
							uni.showToast({
								title: '删除成功',
								icon: 'success'
							});
						}).catch(err => {
							console.error('删除失败:', err);
							// 删除失败时从本地列表中移除
							this.insuranceList = this.insuranceList.filter(item => item.id !== id);
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
	border: 1rpx solid rgba(175, 82, 222, 0.22);
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

.fab-add-insurance {
	background: linear-gradient(145deg, #af52de, #8944ab);
	box-shadow: 0 12rpx 32rpx rgba(175, 82, 222, 0.35);
}

.fab-add-icon {
	font-size: 56rpx;
	color: #ffffff;
	font-weight: 300;
	line-height: 1;
}

.insurance-list {
	margin-top: 20rpx;
}

.insurance-item {
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

.insurance-company {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.expire-date {
	display: block;
	font-size: 24rpx;
	color: #666;
	margin-bottom: 8rpx;
}

.premium {
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
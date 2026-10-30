<template>
	<view class="container">
		<view class="card">
			<text class="title">导出数据库</text>
			<text class="desc">把当前数据库另存到手机 Download 目录，文件名带日期。换手机或重装 App 时用它恢复。</text>
			<button class="action-btn primary" @click="doExport">导出到 Download</button>
		</view>

		<view class="card">
			<text class="title">导入数据库</text>
			<text class="desc">从系统文件选择器挑一个 .db 文件，App 会用其替换当前数据库。导入前建议先导出一份。</text>
			<button class="action-btn" @click="goImport">选择 .db 文件</button>
		</view>

		<view class="card">
			<text class="title">当前数据</text>
			<text class="desc">{{ summary }}</text>
		</view>
	</view>
</template>

<script>
import { query, exportDbToDownload } from '../../utils/db.js';
export default {
	data() {
		return {
			summary: '读取中…'
		};
	},
	onShow() {
		this.loadSummary();
	},
	methods: {
		loadSummary() {
			Promise.all([
				query('SELECT COUNT(*) as c FROM car'),
				query('SELECT COUNT(*) as c FROM rental')
			]).then(([carRes, rentalRes]) => {
				const carCount = carRes && carRes[0] ? carRes[0].c : 0;
				const rentalCount = rentalRes && rentalRes[0] ? rentalRes[0].c : 0;
				this.summary = '车辆 ' + carCount + ' 辆，租约 ' + rentalCount + ' 条';
			}).catch(() => {
				this.summary = '读取失败';
			});
		},
		doExport() {
			// #ifdef APP-PLUS
			uni.showLoading({ title: '导出中', mask: true });
			exportDbToDownload().then((fileName) => {
				uni.hideLoading();
				uni.showModal({
					title: '导出成功',
					content: '已保存到手机 Download 目录：\n' + fileName,
					showCancel: false
				});
			}).catch((err) => {
				uni.hideLoading();
				uni.showModal({
					title: '导出失败',
					content: String((err && err.message) || err),
					showCancel: false
				});
			});
			// #endif
			// #ifndef APP-PLUS
			uni.showToast({ title: '仅 App 端支持', icon: 'none' });
			// #endif
		},
		goImport() {
			// #ifdef APP-PLUS
			uni.navigateTo({ url: './import-db' });
			// #endif
			// #ifndef APP-PLUS
			uni.showToast({ title: '仅 App 端支持', icon: 'none' });
			// #endif
		}
	}
};
</script>

<style scoped>
.container {
	padding: 20rpx;
}

.card {
	margin-bottom: 20rpx;
}

.desc {
	display: block;
	margin: 12rpx 0 24rpx;
	font-size: 24rpx;
	line-height: 1.6;
	color: #666;
}

.action-btn {
	width: 100%;
	padding: 15rpx;
	border-radius: 8rpx;
	background-color: #f0f0f0;
	color: #333;
	font-size: 24rpx;
}

.action-btn.primary {
	background-color: #007AFF;
	color: #ffffff;
}
</style>

<script>
import { initDb } from './utils/db.js';
export default {
	onLaunch: function () {
		console.log('App Launch');
		// 初始化数据库
		this.initDatabase();
	},
	onShow: function () {
		console.log('App Show')
	},
	onHide: function () {
		console.log('App Hide')
	},
	methods: {
		initDatabase() {
			// 无论什么平台都尝试初始化数据库
			// 浏览器环境会自动使用IndexedDB
			// App环境会使用plus.sqlite
			initDb().then(() => {
				console.log('数据库初始化成功');
			}).catch(err => {
				console.error('数据库初始化失败:', err);
				// 初始化失败时使用模拟数据
				console.log('使用模拟数据');
			});
		}
	}
}
</script>

<style>
/*每个页面公共css */
page {
	background-color: #f5f5f5;
	font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

/* 统一按钮样式 */
button {
	border: none;
	outline: none;
	font-size: 24rpx;
}

/* 统一输入框样式 */
input,
textarea {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
	font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

/* 统一卡片样式 */
.card {
	background-color: white;
	padding: 20rpx;
	border-radius: 8rpx;
	box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
	margin-bottom: 15rpx;
}

/* 统一标题样式 */
.title {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
}

/* 统一标签样式 */
.label {
	display: block;
	font-size: 24rpx;
	color: #333;
	margin-bottom: 8rpx;
}

/* 统一按钮组样式 */
.button-group {
	display: flex;
	gap: 20rpx;
	margin-top: 40rpx;
}

/* 统一保存按钮样式 */
.save-btn {
	flex: 1;
	background-color: #007AFF;
	color: white;
	padding: 15rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
}

/* 统一取消按钮样式 */
.cancel-btn {
	flex: 1;
	background-color: #f0f0f0;
	color: #333;
	padding: 15rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
}

/* 统一表单项样式 */
.form-item {
	margin-bottom: 20rpx;
}

/* 统一选择器样式 */
.picker {
	border: 1rpx solid #ddd;
	border-radius: 8rpx;
	padding: 15rpx;
	font-size: 24rpx;
	color: #666;
}
</style>

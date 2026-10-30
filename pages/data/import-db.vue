<template>
	<web-view :src="pageUrl" @message="onMessage"></web-view>
</template>

<script>
import { importDbFromBase64 } from '../../utils/db.js';
export default {
	data() {
		return {
			pageUrl: '/static/db-import.html',
			chunks: {},
			total: 0,
			importing: false
		};
	},
	methods: {
		/** web-view 里选完文件后，H5 分片 postMessage 过来 */
		onMessage(e) {
			if (this.importing) {
				return;
			}
			const list = (e.detail && e.detail.data) || [];
			list.forEach((msg) => {
				if (!msg || msg.type !== 'db-chunk') {
					return;
				}
				this.chunks[msg.seq] = msg.data;
				this.total = msg.total || 0;
			});
			if (this.total > 0 && Object.keys(this.chunks).length >= this.total) {
				this.writeChunks();
			}
		},
		writeChunks() {
			this.importing = true;
			const keys = Object.keys(this.chunks).sort((a, b) => Number(a) - Number(b));
			const base64 = keys.map((k) => this.chunks[k]).join('');
			this.chunks = {};
			this.total = 0;
			uni.showLoading({ title: '导入中', mask: true });
			importDbFromBase64(base64).then(() => {
				uni.hideLoading();
				uni.showModal({
					title: '导入成功',
					content: '数据库已替换，请核对车辆与租约数据。',
					showCancel: false,
					success: () => {
						uni.reLaunch({ url: '/pages/index/index' });
					}
				});
			}).catch((err) => {
				uni.hideLoading();
				this.importing = false;
				uni.showModal({
					title: '导入失败',
					content: String((err && err.message) || err),
					showCancel: false
				});
			});
		}
	}
};
</script>

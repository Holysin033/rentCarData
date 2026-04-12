// 全局拦截器，将所有返回值转换为 Promise
// 解决：uni-app 中的 Promise 语法糖在返回值为数组时，需要手动处理，
// 如：res.data[0].id
uni.addInterceptor({
  returnValue (res) {
    if (!(!!res && (typeof res === "object" || typeof res === "function") && typeof res.then === "function")) {
      return res;
    }
    return new Promise((resolve, reject) => {
      res.then((res) => {
        if (!res) return resolve(res) 
        return res[0] ? reject(res[0]) : resolve(res[1])
      });
    });
  },
});
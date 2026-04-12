if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  function formatAppLog(type, filename, ...args) {
    if (uni.__log__) {
      uni.__log__(type, filename, ...args);
    } else {
      console[type].apply(console, [...args, filename]);
    }
  }
  const dbName = "car_management";
  let db = null;
  let isBrowser = typeof plus === "undefined";
  let indexedDb = null;
  function initDb() {
    return new Promise((resolve, reject) => {
      if (isBrowser) {
        initIndexedDB().then(resolve).catch(reject);
      } else {
        initIndexedDB().then(resolve).catch(reject);
      }
    });
  }
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = function(event) {
        reject("IndexedDB打开失败: " + event.target.error);
      };
      request.onsuccess = function(event) {
        indexedDb = event.target.result;
        db = dbName;
        resolve();
      };
      request.onupgradeneeded = function(event) {
        const db2 = event.target.result;
        if (!db2.objectStoreNames.contains("car")) {
          db2.createObjectStore("car", { keyPath: "id", autoIncrement: true });
        }
        if (!db2.objectStoreNames.contains("insurance")) {
          db2.createObjectStore("insurance", { keyPath: "id", autoIncrement: true });
        }
        if (!db2.objectStoreNames.contains("maintenance")) {
          db2.createObjectStore("maintenance", { keyPath: "id", autoIncrement: true });
        }
        if (!db2.objectStoreNames.contains("rental")) {
          db2.createObjectStore("rental", { keyPath: "id", autoIncrement: true });
        }
        if (!db2.objectStoreNames.contains("statistics_config")) {
          db2.createObjectStore("statistics_config", { keyPath: "id", autoIncrement: true });
        }
      };
    });
  }
  function executeSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject("数据库未初始化");
        return;
      }
      if (isBrowser) {
        executeIndexedDb(sql, params).then(resolve).catch(reject);
      } else {
        plus.sqlite.executeSql({
          dbname: dbName,
          sql,
          params,
          success: function(res) {
            resolve(res);
          },
          error: function(e) {
            reject(e);
          }
        });
      }
    });
  }
  function query(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject("数据库未初始化");
        return;
      }
      if (isBrowser) {
        queryIndexedDb(sql, params).then(resolve).catch(reject);
      } else {
        plus.sqlite.selectSql({
          dbname: dbName,
          sql,
          params,
          success: function(res) {
            resolve(res);
          },
          error: function(e) {
            reject(e);
          }
        });
      }
    });
  }
  function executeIndexedDb(sql, params) {
    return new Promise((resolve, reject) => {
      try {
        const lowerSql = sql.toLowerCase();
        let tableName = "";
        let operation = "";
        if (lowerSql.startsWith("insert into")) {
          operation = "insert";
          tableName = lowerSql.match(/insert into\s+(\w+)/)[1];
        } else if (lowerSql.startsWith("update")) {
          operation = "update";
          tableName = lowerSql.match(/update\s+(\w+)/)[1];
        } else if (lowerSql.startsWith("delete from")) {
          operation = "delete";
          tableName = lowerSql.match(/delete from\s+(\w+)/)[1];
        }
        if (!tableName) {
          reject("不支持的SQL操作");
          return;
        }
        const transaction = indexedDb.transaction([tableName], "readwrite");
        const store = transaction.objectStore(tableName);
        if (operation === "insert") {
          const fieldsMatch = sql.match(/\(([^)]+)\)/);
          const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
          if (fieldsMatch && valuesMatch) {
            const fields = fieldsMatch[1].split(",").map((field) => field.trim());
            const values = params;
            const item = {};
            fields.forEach((field, index) => {
              if (index < values.length) {
                item[field] = values[index];
              }
            });
            const request = store.add(item);
            request.onsuccess = function() {
              resolve({ affectedRows: 1 });
            };
            request.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的INSERT语句");
          }
        } else if (operation === "update") {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
          if (idMatch && params.length > 0) {
            const id = params[params.length - 1];
            const getRequest = store.get(id);
            getRequest.onsuccess = function(event) {
              const item = event.target.result;
              if (item) {
                const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
                if (setMatch) {
                  const setClause = setMatch[1].trim();
                  const fields = setClause.split(",").map((field) => field.trim().split("=")[0].trim());
                  fields.forEach((field, index) => {
                    if (index < params.length - 1) {
                      item[field] = params[index];
                    }
                  });
                }
                const request = store.put(item);
                request.onsuccess = function() {
                  resolve({ affectedRows: 1 });
                };
                request.onerror = function(event2) {
                  reject(event2.target.error);
                };
              } else {
                reject("记录不存在");
              }
            };
            getRequest.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的UPDATE语句");
          }
        } else if (operation === "delete") {
          const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
          if (idMatch && params.length > 0) {
            const id = params[0];
            const request = store.delete(id);
            request.onsuccess = function() {
              resolve({ affectedRows: 1 });
            };
            request.onerror = function(event) {
              reject(event.target.error);
            };
          } else {
            reject("无效的DELETE语句");
          }
        }
        transaction.oncomplete = function() {
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  function queryIndexedDb(sql, params) {
    return new Promise((resolve, reject) => {
      try {
        const lowerSql = sql.toLowerCase();
        let tableName = "";
        if (lowerSql.startsWith("select")) {
          tableName = lowerSql.match(/from\s+(\w+)/)[1];
        }
        if (!tableName) {
          reject("不支持的SQL查询");
          return;
        }
        const transaction = indexedDb.transaction([tableName], "readonly");
        const store = transaction.objectStore(tableName);
        const request = store.getAll();
        request.onsuccess = function(event) {
          let result = event.target.result;
          const whereMatch = sql.match(/WHERE\s+([^;]+)/i);
          if (whereMatch) {
            const whereClause = whereMatch[1];
            if (whereClause.includes("id = ?") && params.length > 0) {
              const id = params[0];
              result = result.filter((item) => item.id == id);
            } else if (whereClause.includes("carId = ?") && params.length > 0) {
              const carId = params[0];
              result = result.filter((item) => item.carId == carId);
            } else if (whereClause.includes("substr") && params.length > 0) {
              const value = params[0];
              result = result.filter((item) => {
                if (whereClause.includes("startDate")) {
                  return item.startDate && item.startDate.substring(0, 7) == value;
                } else if (whereClause.includes("maintenanceDate")) {
                  return item.maintenanceDate && item.maintenanceDate.substring(0, 7) == value;
                }
                return false;
              });
            }
          }
          const groupMatch = sql.match(/group by\s+([^;]+)/i);
          if (groupMatch) {
            const groupField = groupMatch[1].trim();
            const sumMatch = sql.match(/sum\s*\(.*?\)\s*as\s*(\w+)/i);
            if (sumMatch) {
              const sumField = sumMatch[1];
              const groupedData = {};
              result.forEach((item) => {
                let groupKey;
                if (groupField === "substr(startDate, 1, 7)") {
                  groupKey = item.startDate ? item.startDate.substring(0, 7) : "";
                } else if (groupField === "carName") {
                  groupKey = item.carName || "";
                } else {
                  groupKey = item[groupField] || "";
                }
                if (!groupedData[groupKey]) {
                  groupedData[groupKey] = 0;
                }
                const amount = item.changedTotalAmount || item.initialTotalAmount || 0;
                groupedData[groupKey] += amount;
              });
              result = Object.entries(groupedData).map(([key, value]) => {
                const item = {};
                if (groupField === "substr(startDate, 1, 7)") {
                  item.month = key;
                } else if (groupField === "carName") {
                  item.carName = key;
                  item.count = result.filter((i) => i.carName === key).length;
                } else {
                  item[groupField] = key;
                }
                item[sumField] = value;
                return item;
              });
            }
          }
          const orderMatch = sql.match(/order by\s+([^;]+)/i);
          if (orderMatch) {
            const orderClause = orderMatch[1].trim();
            if (orderClause.includes("desc")) {
              const field = orderClause.replace("desc", "").trim();
              result.sort((a, b) => {
                if (typeof a[field] === "string" && typeof b[field] === "string") {
                  return b[field].localeCompare(a[field]);
                } else {
                  return b[field] - a[field];
                }
              });
            } else if (orderClause.includes("asc")) {
              const field = orderClause.replace("asc", "").trim();
              result.sort((a, b) => {
                if (typeof a[field] === "string" && typeof b[field] === "string") {
                  return a[field].localeCompare(b[field]);
                } else {
                  return a[field] - b[field];
                }
              });
            }
          }
          const limitMatch = sql.match(/limit\s+(\d+)/i);
          if (limitMatch) {
            const limit = parseInt(limitMatch[1]);
            result = result.slice(0, limit);
          }
          resolve(result);
        };
        request.onerror = function(event) {
          reject(event.target.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _sfc_main$d = {
    data() {
      return {
        carList: [],
        searchKeyword: ""
      };
    },
    onLoad() {
      this.loadCarList();
    },
    onShow() {
      this.loadCarList();
    },
    computed: {
      filteredCarList() {
        if (!this.searchKeyword) {
          return this.carList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.carList.filter(
          (item) => item.name.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car ORDER BY id DESC`;
        query(sql).then((res) => {
          this.carList = res || [];
          this.carList.forEach((car) => {
            car.latestMaintenance = "无";
            car.latestInsurance = "无";
            query(`SELECT maintenanceDate FROM maintenance WHERE carId = ? ORDER BY maintenanceDate DESC LIMIT 1`, [car.id]).then((maintenanceRes) => {
              if (maintenanceRes && maintenanceRes.length > 0) {
                car.latestMaintenance = maintenanceRes[0].maintenanceDate;
              }
            });
            query(`SELECT expireDate FROM insurance WHERE carId = ? ORDER BY expireDate DESC LIMIT 1`, [car.id]).then((insuranceRes) => {
              if (insuranceRes && insuranceRes.length > 0) {
                car.latestInsurance = insuranceRes[0].expireDate;
              }
            });
          });
          if (this.carList.length === 0) {
            this.carList = [
              {
                id: 1,
                name: "大众朗逸",
                carNumber: "京A12345",
                imagePath: "",
                latestMaintenance: "2026-03-15",
                latestInsurance: "2026-12-31"
              },
              {
                id: 2,
                name: "丰田凯美瑞",
                carNumber: "京B67890",
                imagePath: "",
                latestMaintenance: "2026-02-20",
                latestInsurance: "2026-11-30"
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/index/index.vue:107", "加载车辆列表失败:", err);
          this.carList = [
            {
              id: 1,
              name: "大众朗逸",
              carNumber: "京A12345",
              imagePath: "",
              latestMaintenance: "2026-03-15",
              latestInsurance: "2026-12-31"
            },
            {
              id: 2,
              name: "丰田凯美瑞",
              carNumber: "京B67890",
              imagePath: "",
              latestMaintenance: "2026-02-20",
              latestInsurance: "2026-11-30"
            }
          ];
        });
      },
      addCar() {
        uni.navigateTo({
          url: "./add-car"
        });
      },
      editCar(item) {
        uni.navigateTo({
          url: "./edit-car?id=" + item.id
        });
      },
      deleteCar(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这辆车吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM car WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.carList = this.carList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/index/index.vue:157", "删除失败:", err);
                this.carList = this.carList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$c(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "按车名搜索",
              class: "search-input",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("button", {
          onClick: _cache[2] || (_cache[2] = (...args) => $options.addCar && $options.addCar(...args)),
          class: "add-btn"
        }, "添加车辆")
      ]),
      vue.createElementVNode("view", { class: "car-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredCarList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "car-item"
            }, [
              vue.createElementVNode("view", { class: "item-content" }, [
                vue.createElementVNode(
                  "text",
                  { class: "car-name" },
                  vue.toDisplayString(item.name),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "car-number" },
                  "车牌号：" + vue.toDisplayString(item.carNumber || "未填写"),
                  1
                  /* TEXT */
                ),
                item.imagePath ? (vue.openBlock(), vue.createElementBlock(
                  "text",
                  {
                    key: 0,
                    class: "image-path"
                  },
                  "照片路径：" + vue.toDisplayString(item.imagePath),
                  1
                  /* TEXT */
                )) : vue.createCommentVNode("v-if", true),
                vue.createElementVNode(
                  "text",
                  { class: "maintenance-date" },
                  "最新保养：" + vue.toDisplayString(item.latestMaintenance || "无"),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "insurance-date" },
                  "最新保险：" + vue.toDisplayString(item.latestInsurance || "无"),
                  1
                  /* TEXT */
                )
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editCar(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteCar(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ])
    ]);
  }
  const PagesIndexIndex = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["render", _sfc_render$c], ["__scopeId", "data-v-1cf27b2a"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/index.vue"]]);
  const _sfc_main$c = {
    data() {
      return {
        car: {
          name: "",
          carNumber: "",
          imagePath: ""
        }
      };
    },
    methods: {
      saveCar() {
        if (!this.car.name) {
          uni.showToast({
            title: "请输入车名",
            icon: "none"
          });
          return;
        }
        const sql = `INSERT INTO car (name, carNumber, imagePath, createdAt) VALUES (?, ?, ?, ?)`;
        const params = [this.car.name, this.car.carNumber, this.car.imagePath, (/* @__PURE__ */ new Date()).toISOString()];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "保存成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/index/add-car.vue:71", "保存失败:", err);
          uni.showToast({
            title: "保存失败",
            icon: "none"
          });
        });
      },
      chooseImage() {
        uni.chooseImage({
          count: 1,
          sizeType: ["original", "compressed"],
          sourceType: ["album", "camera"],
          success: (res) => {
            const fileName = "img_" + Date.now() + ".jpg";
            const imagePath = "static/carImgs/" + fileName;
            this.car.imagePath = imagePath;
            uni.showToast({
              title: "图片选择成功",
              icon: "success"
            });
          },
          fail: (err) => {
            formatAppLog("error", "at pages/index/add-car.vue:94", "选择图片失败:", err);
            uni.showToast({
              title: "选择图片失败",
              icon: "none"
            });
          }
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$b(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, [
            vue.createTextVNode("车名 "),
            vue.createElementVNode("text", { style: { "color": "red" } }, "*")
          ]),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.car.name = $event),
              placeholder: "请输入车名",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.name]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车牌号"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.car.carNumber = $event),
              placeholder: "请输入车牌号（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.carNumber]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "照片"),
          vue.createElementVNode("view", { class: "image-upload" }, [
            $data.car.imagePath ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "image-preview"
            }, [
              vue.createElementVNode("view", { class: "image-container" }, [
                vue.createElementVNode("image", {
                  src: $data.car.imagePath,
                  mode: "aspectFit",
                  class: "preview-image"
                }, null, 8, ["src"])
              ]),
              vue.createElementVNode("button", {
                onClick: _cache[2] || (_cache[2] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "change-image-btn"
              }, "更换图片")
            ])) : (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "image-placeholder"
            }, [
              vue.createElementVNode("button", {
                onClick: _cache[3] || (_cache[3] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "choose-image-btn"
              }, "选择图片"),
              vue.createElementVNode("text", { class: "hint" }, "图片将保存在static/carImgs文件夹中")
            ]))
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.saveCar && $options.saveCar(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesIndexAddCar = /* @__PURE__ */ _export_sfc(_sfc_main$c, [["render", _sfc_render$b], ["__scopeId", "data-v-a389b924"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/add-car.vue"]]);
  const _sfc_main$b = {
    data() {
      return {
        car: {
          id: "",
          name: "",
          carNumber: "",
          imagePath: ""
        }
      };
    },
    onLoad(options) {
      this.car.id = parseInt(options.id);
      this.loadCarInfo();
    },
    methods: {
      loadCarInfo() {
        const sql = `SELECT * FROM car WHERE id = ?`;
        query(sql, [this.car.id]).then((res) => {
          if (res && res.length > 0) {
            this.car = res[0];
          } else {
            this.car = {
              id: this.car.id,
              name: "大众朗逸",
              carNumber: "京A12345",
              imagePath: ""
            };
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/index/edit-car.vue:70", "加载车辆信息失败:", err);
          this.car = {
            id: this.car.id,
            name: "大众朗逸",
            carNumber: "京A12345",
            imagePath: ""
          };
        });
      },
      updateCar() {
        if (!this.car.name) {
          uni.showToast({
            title: "请输入车名",
            icon: "none"
          });
          return;
        }
        const sql = `UPDATE car SET name = ?, carNumber = ?, imagePath = ? WHERE id = ?`;
        const params = [this.car.name, this.car.carNumber, this.car.imagePath, this.car.id];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "更新成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/index/edit-car.vue:103", "更新失败:", err);
          uni.showToast({
            title: "更新失败",
            icon: "none"
          });
        });
      },
      chooseImage() {
        uni.chooseImage({
          count: 1,
          sizeType: ["original", "compressed"],
          sourceType: ["album", "camera"],
          success: (res) => {
            const fileName = "img_" + Date.now() + ".jpg";
            const imagePath = "static/carImgs/" + fileName;
            this.car.imagePath = imagePath;
            uni.showToast({
              title: "图片选择成功",
              icon: "success"
            });
          },
          fail: (err) => {
            formatAppLog("error", "at pages/index/edit-car.vue:126", "选择图片失败:", err);
            uni.showToast({
              title: "选择图片失败",
              icon: "none"
            });
          }
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$a(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, [
            vue.createTextVNode("车名 "),
            vue.createElementVNode("text", { style: { "color": "red" } }, "*")
          ]),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.car.name = $event),
              placeholder: "请输入车名",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.name]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车牌号"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.car.carNumber = $event),
              placeholder: "请输入车牌号（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.car.carNumber]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "照片"),
          vue.createElementVNode("view", { class: "image-upload" }, [
            $data.car.imagePath ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "image-preview"
            }, [
              vue.createElementVNode("view", { class: "image-container" }, [
                vue.createElementVNode("image", {
                  src: $data.car.imagePath,
                  mode: "aspectFit",
                  class: "preview-image"
                }, null, 8, ["src"])
              ]),
              vue.createElementVNode("button", {
                onClick: _cache[2] || (_cache[2] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "change-image-btn"
              }, "更换图片")
            ])) : (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "image-placeholder"
            }, [
              vue.createElementVNode("button", {
                onClick: _cache[3] || (_cache[3] = (...args) => $options.chooseImage && $options.chooseImage(...args)),
                class: "choose-image-btn"
              }, "选择图片"),
              vue.createElementVNode("text", { class: "hint" }, "图片将保存在static/carImgs文件夹中")
            ]))
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.updateCar && $options.updateCar(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesIndexEditCar = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["render", _sfc_render$a], ["__scopeId", "data-v-adc15339"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/index/edit-car.vue"]]);
  const _sfc_main$a = {
    data() {
      return {
        insuranceList: [],
        searchKeyword: ""
      };
    },
    onLoad() {
      this.loadInsuranceList();
    },
    onShow() {
      this.loadInsuranceList();
    },
    computed: {
      filteredInsuranceList() {
        if (!this.searchKeyword) {
          return this.insuranceList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.insuranceList.filter(
          (item) => item.carName.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadInsuranceList() {
        const sql = `SELECT * FROM insurance ORDER BY id DESC`;
        query(sql).then((res) => {
          this.insuranceList = res || [];
          this.checkExpiringInsurance();
          if (this.insuranceList.length === 0) {
            this.insuranceList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                company: "平安保险",
                expireDate: "2026-12-31",
                premium: 5e3
              },
              {
                id: 2,
                carName: "本田雅阁",
                company: "人保财险",
                expireDate: "2026-10-15",
                premium: 4500
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/insurance/insurance.vue:83", "加载保险列表失败:", err);
          this.insuranceList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              company: "平安保险",
              expireDate: "2026-12-31",
              premium: 5e3
            },
            {
              id: 2,
              carName: "本田雅阁",
              company: "人保财险",
              expireDate: "2026-10-15",
              premium: 4500
            }
          ];
        });
      },
      checkExpiringInsurance() {
        const today = /* @__PURE__ */ new Date();
        const thirtyDaysLater = /* @__PURE__ */ new Date();
        thirtyDaysLater.setDate(today.getDate() + 30);
        const expiringInsurance = this.insuranceList.filter((item) => {
          const expireDate = new Date(item.expireDate);
          return expireDate >= today && expireDate <= thirtyDaysLater;
        });
        if (expiringInsurance.length > 0) {
          uni.showModal({
            title: "保险到期提醒",
            content: `有 ${expiringInsurance.length} 条保险即将到期，请及时处理。`,
            showCancel: false
          });
        }
      },
      addInsurance() {
        uni.navigateTo({
          url: "./add-insurance"
        });
      },
      editInsurance(item) {
        uni.navigateTo({
          url: "./edit-insurance?id=" + item.id
        });
      },
      deleteInsurance(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这条保险记录吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM insurance WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.insuranceList = this.insuranceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/insurance/insurance.vue:151", "删除失败:", err);
                this.insuranceList = this.insuranceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$9(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "按车名搜索",
              class: "search-input",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("button", {
          onClick: _cache[2] || (_cache[2] = (...args) => $options.addInsurance && $options.addInsurance(...args)),
          class: "add-btn"
        }, "添加保险")
      ]),
      vue.createElementVNode("view", { class: "insurance-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredInsuranceList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "insurance-item"
            }, [
              vue.createElementVNode("view", { class: "item-content" }, [
                vue.createElementVNode(
                  "text",
                  { class: "car-number" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "insurance-company" },
                  vue.toDisplayString(item.company),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "expire-date" },
                  "到期日期：" + vue.toDisplayString(item.expireDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "premium" },
                  "保费：" + vue.toDisplayString(item.premium) + "元",
                  1
                  /* TEXT */
                )
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editInsurance(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteInsurance(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ])
    ]);
  }
  const PagesInsuranceInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["render", _sfc_render$9], ["__scopeId", "data-v-4afc8b09"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/insurance.vue"]]);
  const _sfc_main$9 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        insurance: {
          company: "",
          expireDate: "",
          premium: ""
        }
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
            if (this.carList.length > 0) {
              this.selectedCar = this.carList[0];
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/add-insurance.vue:66", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
            this.selectedCar = this.carList[0];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.insurance.expireDate = e.detail.value;
      },
      saveInsurance() {
        if (!this.selectedCar || !this.insurance.company || !this.insurance.expireDate || !this.insurance.premium) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `INSERT INTO insurance (carId, carName, company, expireDate, premium, createdAt) VALUES (?, ?, ?, ?, ?, ?)`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.insurance.company, this.insurance.expireDate, this.insurance.premium, (/* @__PURE__ */ new Date()).toISOString()];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "保存成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/add-insurance.vue:126", "保存失败:", err);
            uni.showToast({
              title: "保存失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "保存成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$8(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保险公司"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.insurance.company = $event),
              placeholder: "请输入保险公司",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.company]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "到期日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[2] || (_cache[2] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.insurance.expireDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.insurance.expireDate || "请选择到期日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保费"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.insurance.premium = $event),
              placeholder: "请输入保费",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.premium]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.saveInsurance && $options.saveInsurance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesInsuranceAddInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["render", _sfc_render$8], ["__scopeId", "data-v-08dc6034"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/add-insurance.vue"]]);
  const _sfc_main$8 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        insurance: {
          id: "",
          company: "",
          expireDate: "",
          premium: ""
        }
      };
    },
    onLoad(options) {
      this.insurance.id = options.id;
      this.loadCarList();
      this.loadInsuranceInfo();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:66", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        }
      },
      loadInsuranceInfo() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM insurance WHERE id = ?`;
          query(sql, [this.insurance.id]).then((res) => {
            if (res && res.length > 0) {
              this.insurance = res[0];
              const carIndex = this.carList.findIndex((car) => car.id === this.insurance.carId);
              if (carIndex !== -1) {
                this.selectedCarIndex = carIndex;
                this.selectedCar = this.carList[carIndex];
              }
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:109", "加载保险信息失败:", err);
            this.insurance = {
              id: this.insurance.id,
              company: "平安保险",
              expireDate: "2026-12-31",
              premium: 5e3
            };
            this.selectedCar = this.carList[0];
          });
        } else {
          this.insurance = {
            id: this.insurance.id,
            company: "平安保险",
            expireDate: "2026-12-31",
            premium: 5e3
          };
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.insurance.expireDate = e.detail.value;
      },
      updateInsurance() {
        if (!this.selectedCar || !this.insurance.company || !this.insurance.expireDate || !this.insurance.premium) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `UPDATE insurance SET carId = ?, carName = ?, company = ?, expireDate = ?, premium = ? WHERE id = ?`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.insurance.company, this.insurance.expireDate, this.insurance.premium, this.insurance.id];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "更新成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/insurance/edit-insurance.vue:161", "更新失败:", err);
            uni.showToast({
              title: "更新失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "更新成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$7(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保险公司"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.insurance.company = $event),
              placeholder: "请输入保险公司",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.company]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "到期日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[2] || (_cache[2] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.insurance.expireDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.insurance.expireDate || "请选择到期日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保费"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.insurance.premium = $event),
              placeholder: "请输入保费",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.insurance.premium]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[4] || (_cache[4] = (...args) => $options.updateInsurance && $options.updateInsurance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesInsuranceEditInsurance = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["render", _sfc_render$7], ["__scopeId", "data-v-50aea87a"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/insurance/edit-insurance.vue"]]);
  const _sfc_main$7 = {
    data() {
      return {
        maintenanceList: [],
        searchKeyword: ""
      };
    },
    onLoad() {
      this.loadMaintenanceList();
    },
    onShow() {
      this.loadMaintenanceList();
    },
    computed: {
      filteredMaintenanceList() {
        if (!this.searchKeyword) {
          return this.maintenanceList;
        }
        const keyword = this.searchKeyword.toLowerCase();
        return this.maintenanceList.filter(
          (item) => item.carName.toLowerCase().includes(keyword)
        );
      }
    },
    methods: {
      loadMaintenanceList() {
        const sql = `SELECT * FROM maintenance ORDER BY id DESC`;
        query(sql).then((res) => {
          this.maintenanceList = res || [];
          if (this.maintenanceList.length === 0) {
            this.maintenanceList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                maintenanceDate: "2026-03-15",
                mileage: 1e4,
                cost: 800,
                items: "机油更换、机滤更换"
              },
              {
                id: 2,
                carName: "本田雅阁",
                maintenanceDate: "2026-02-20",
                mileage: 15e3,
                cost: 1200,
                items: "机油更换、机滤更换、空滤更换"
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/maintenance/maintenance.vue:84", "加载保养列表失败:", err);
          this.maintenanceList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              maintenanceDate: "2026-03-15",
              mileage: 1e4,
              cost: 800,
              items: "机油更换、机滤更换"
            },
            {
              id: 2,
              carName: "本田雅阁",
              maintenanceDate: "2026-02-20",
              mileage: 15e3,
              cost: 1200,
              items: "机油更换、机滤更换、空滤更换"
            }
          ];
        });
      },
      addMaintenance() {
        uni.navigateTo({
          url: "./add-maintenance"
        });
      },
      editMaintenance(item) {
        uni.navigateTo({
          url: "./edit-maintenance?id=" + item.id
        });
      },
      deleteMaintenance(id) {
        uni.showModal({
          title: "确认删除",
          content: "确定要删除这条保养记录吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `DELETE FROM maintenance WHERE id = ?`;
              executeSql(sql, [id]).then(() => {
                this.maintenanceList = this.maintenanceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/maintenance/maintenance.vue:134", "删除失败:", err);
                this.maintenanceList = this.maintenanceList.filter((item) => item.id !== id);
                uni.showToast({
                  title: "删除成功",
                  icon: "success"
                });
              });
            }
          }
        });
      },
      handleSearch() {
      }
    }
  };
  function _sfc_render$6(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "按车名搜索",
              class: "search-input",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("button", {
          onClick: _cache[2] || (_cache[2] = (...args) => $options.addMaintenance && $options.addMaintenance(...args)),
          class: "add-btn"
        }, "添加保养记录")
      ]),
      vue.createElementVNode("view", { class: "maintenance-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredMaintenanceList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "maintenance-item"
            }, [
              vue.createElementVNode("view", { class: "item-content" }, [
                vue.createElementVNode(
                  "text",
                  { class: "car-number" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "maintenance-date" },
                  "保养日期：" + vue.toDisplayString(item.maintenanceDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "mileage" },
                  "保养里程：" + vue.toDisplayString(item.mileage) + "公里",
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "cost" },
                  "费用：" + vue.toDisplayString(item.cost) + "元",
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "items" },
                  "保养项目：" + vue.toDisplayString(item.items),
                  1
                  /* TEXT */
                )
              ]),
              vue.createElementVNode("view", { class: "item-actions" }, [
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.editMaintenance(item),
                  class: "edit-btn"
                }, "编辑", 8, ["onClick"]),
                vue.createElementVNode("button", {
                  onClick: ($event) => $options.deleteMaintenance(item.id),
                  class: "delete-btn"
                }, "删除", 8, ["onClick"])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ])
    ]);
  }
  const PagesMaintenanceMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["render", _sfc_render$6], ["__scopeId", "data-v-e50a8caf"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/maintenance.vue"]]);
  const _sfc_main$6 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        maintenance: {
          maintenanceDate: "",
          mileage: "",
          cost: "",
          items: ""
        }
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
            if (this.carList.length > 0) {
              this.selectedCar = this.carList[0];
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/add-maintenance.vue:71", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
            this.selectedCar = this.carList[0];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.maintenance.maintenanceDate = e.detail.value;
      },
      saveMaintenance() {
        if (!this.selectedCar || !this.maintenance.maintenanceDate || !this.maintenance.mileage || !this.maintenance.cost || !this.maintenance.items) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `INSERT INTO maintenance (carId, carName, maintenanceDate, mileage, cost, items, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.maintenance.maintenanceDate, this.maintenance.mileage, this.maintenance.cost, this.maintenance.items, (/* @__PURE__ */ new Date()).toISOString()];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "保存成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/add-maintenance.vue:131", "保存失败:", err);
            uni.showToast({
              title: "保存失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "保存成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$5(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[1] || (_cache[1] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.maintenance.maintenanceDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.maintenance.maintenanceDate || "请选择保养日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养里程"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.maintenance.mileage = $event),
              placeholder: "请输入保养里程",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.mileage]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "费用"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.maintenance.cost = $event),
              placeholder: "请输入费用",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.cost]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养项目"),
          vue.withDirectives(vue.createElementVNode(
            "textarea",
            {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $data.maintenance.items = $event),
              placeholder: "请输入保养项目",
              class: "textarea"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.items]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.saveMaintenance && $options.saveMaintenance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[6] || (_cache[6] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesMaintenanceAddMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["render", _sfc_render$5], ["__scopeId", "data-v-cf4facb6"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/add-maintenance.vue"]]);
  const _sfc_main$5 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        maintenance: {
          id: "",
          maintenanceDate: "",
          mileage: "",
          cost: "",
          items: ""
        }
      };
    },
    onLoad(options) {
      this.maintenance.id = options.id;
      this.loadCarList();
      this.loadMaintenanceInfo();
    },
    methods: {
      loadCarList() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM car`;
          query(sql).then((res) => {
            this.carList = res || [];
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:71", "加载车辆列表失败:", err);
            this.carList = [
              {
                id: 1,
                name: "丰田凯美瑞"
              },
              {
                id: 2,
                name: "本田雅阁"
              }
            ];
          });
        } else {
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        }
      },
      loadMaintenanceInfo() {
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `SELECT * FROM maintenance WHERE id = ?`;
          query(sql, [this.maintenance.id]).then((res) => {
            if (res && res.length > 0) {
              this.maintenance = res[0];
              const carIndex = this.carList.findIndex((car) => car.id === this.maintenance.carId);
              if (carIndex !== -1) {
                this.selectedCarIndex = carIndex;
                this.selectedCar = this.carList[carIndex];
              }
            }
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:114", "加载保养信息失败:", err);
            this.maintenance = {
              id: this.maintenance.id,
              maintenanceDate: "2026-03-15",
              mileage: 1e4,
              cost: 800,
              items: "机油更换、机滤更换"
            };
            this.selectedCar = this.carList[0];
          });
        } else {
          this.maintenance = {
            id: this.maintenance.id,
            maintenanceDate: "2026-03-15",
            mileage: 1e4,
            cost: 800,
            items: "机油更换、机滤更换"
          };
          this.selectedCar = this.carList[0];
        }
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onDateChange(e) {
        this.maintenance.maintenanceDate = e.detail.value;
      },
      updateMaintenance() {
        if (!this.selectedCar || !this.maintenance.maintenanceDate || !this.maintenance.mileage || !this.maintenance.cost || !this.maintenance.items) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        if (uni.getSystemInfoSync().platform !== "h5") {
          const sql = `UPDATE maintenance SET carId = ?, carName = ?, maintenanceDate = ?, mileage = ?, cost = ?, items = ? WHERE id = ?`;
          const params = [this.selectedCar.id, this.selectedCar.name, this.maintenance.maintenanceDate, this.maintenance.mileage, this.maintenance.cost, this.maintenance.items, this.maintenance.id];
          executeSql(sql, params).then(() => {
            uni.showToast({
              title: "更新成功",
              icon: "success"
            });
            uni.navigateBack();
          }).catch((err) => {
            formatAppLog("error", "at pages/maintenance/edit-maintenance.vue:168", "更新失败:", err);
            uni.showToast({
              title: "更新失败",
              icon: "none"
            });
          });
        } else {
          uni.showToast({
            title: "更新成功（模拟）",
            icon: "success"
          });
          uni.navigateBack();
        }
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$4(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养日期"),
          vue.createElementVNode("picker", {
            mode: "date",
            onChange: _cache[1] || (_cache[1] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.maintenance.maintenanceDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.maintenance.maintenanceDate || "请选择保养日期"),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养里程"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.maintenance.mileage = $event),
              placeholder: "请输入保养里程",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.mileage]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "费用"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.maintenance.cost = $event),
              placeholder: "请输入费用",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.cost]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "保养项目"),
          vue.withDirectives(vue.createElementVNode(
            "textarea",
            {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $data.maintenance.items = $event),
              placeholder: "请输入保养项目",
              class: "textarea"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.maintenance.items]
          ])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[5] || (_cache[5] = (...args) => $options.updateMaintenance && $options.updateMaintenance(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[6] || (_cache[6] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesMaintenanceEditMaintenance = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$4], ["__scopeId", "data-v-b25d45f2"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/maintenance/edit-maintenance.vue"]]);
  const _sfc_main$4 = {
    data() {
      return {
        rentalList: [],
        searchKeyword: "",
        statusOptions: ["全部", "进行中", "已完成"],
        selectedStatusIndex: 0,
        // 滑动操作相关状态
        startX: 0,
        endX: 0,
        currentId: 0,
        showSlideAction: false,
        slideDirection: "",
        slideId: 0
      };
    },
    onLoad() {
      this.loadRentalList();
    },
    onShow() {
      this.loadRentalList();
    },
    methods: {
      loadRentalList() {
        const sql = `SELECT * FROM rental ORDER BY id DESC`;
        query(sql).then((res) => {
          const rentals = res.sort((a, b) => b.id - a.id) || [];
          this.rentalList = rentals.map((item) => {
            if (item.totalAmount && !item.initialTotalAmount) {
              item.initialTotalAmount = item.totalAmount;
              delete item.totalAmount;
            }
            if (item.changeAmount && item.changeAmount < 0) {
              item.changeAmount = Math.abs(item.changeAmount);
            }
            return item;
          });
          if (this.rentalList.length === 0) {
            this.rentalList = [
              {
                id: 1,
                carName: "丰田凯美瑞",
                startDate: "2026-04-01",
                endDate: "2026-04-05",
                days: 5,
                dailyRate: 300,
                initialTotalAmount: 1500,
                status: "已完成"
              },
              {
                id: 2,
                carName: "本田雅阁",
                startDate: "2026-04-10",
                endDate: "2026-04-15",
                days: 6,
                dailyRate: 350,
                initialTotalAmount: 2100,
                changeAmount: 700,
                changeAction: "续租",
                changedTotalAmount: 2800,
                updatedAt: "2026-04-12",
                status: "进行中"
              }
            ];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/rental.vue:138", "加载租赁列表失败:", err);
          this.rentalList = [
            {
              id: 1,
              carName: "丰田凯美瑞",
              startDate: "2026-04-01",
              endDate: "2026-04-05",
              days: 5,
              dailyRate: 300,
              initialTotalAmount: 1500,
              status: "已完成"
            },
            {
              id: 2,
              carName: "本田雅阁",
              startDate: "2026-04-10",
              endDate: "2026-04-15",
              days: 6,
              dailyRate: 350,
              initialTotalAmount: 2100,
              changeAmount: 700,
              changeAction: "续租",
              changedTotalAmount: 2800,
              updatedAt: "2026-04-12",
              status: "进行中"
            }
          ];
        });
      },
      addRental() {
        uni.navigateTo({
          url: "./add-rental"
        });
      },
      editRental(item) {
        uni.navigateTo({
          url: "./edit-rental?id=" + item.id
        });
      },
      deleteRental(id) {
        const rentalItem = this.rentalList.find((item) => item.id === id);
        if (!rentalItem)
          return;
        uni.showModal({
          title: "确认删除",
          content: "请输入此次总金额以确认删除",
          editable: true,
          placeholderText: "请输入总金额",
          success: (res) => {
            if (res.confirm) {
              const inputAmount = parseFloat(res.content);
              const totalAmount = rentalItem.changedTotalAmount || parseFloat(rentalItem.initialTotalAmount);
              if (inputAmount === totalAmount) {
                const sql = `DELETE FROM rental WHERE id = ?`;
                executeSql(sql, [id]).then(() => {
                  this.rentalList = this.rentalList.filter((item) => item.id !== id);
                  uni.showToast({
                    title: "删除成功",
                    icon: "success"
                  });
                }).catch((err) => {
                  formatAppLog("error", "at pages/rental/rental.vue:208", "删除失败:", err);
                  this.rentalList = this.rentalList.filter((item) => item.id !== id);
                  uni.showToast({
                    title: "删除成功",
                    icon: "success"
                  });
                });
              } else {
                uni.showToast({
                  title: "金额验证失败，删除取消",
                  icon: "error"
                });
              }
            }
          }
        });
      },
      formatDateToDay(dateString) {
        if (!dateString)
          return "";
        if (dateString.includes("T")) {
          return dateString.split("T")[0];
        }
        return dateString;
      },
      handleStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      handleSearch() {
      },
      // 续租功能
      renewRental(item) {
        uni.showModal({
          title: "续租",
          content: "请输入续租的金额变化",
          editable: true,
          placeholderText: "请输入金额",
          success: (res) => {
            if (res.confirm) {
              const changeAmount = parseFloat(res.content);
              if (isNaN(changeAmount) || changeAmount <= 0) {
                uni.showToast({
                  title: "输入格式错误，金额应为正数",
                  icon: "error"
                });
                return;
              }
              const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
              const newTotalAmount = baseAmount + changeAmount;
              const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
              const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
              const params = [changeAmount, "续租", newTotalAmount, updatedAt, item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].changeAmount = changeAmount;
                  this.rentalList[index].changeAction = "续租";
                  this.rentalList[index].changedTotalAmount = newTotalAmount;
                  this.rentalList[index].updatedAt = updatedAt;
                  delete this.rentalList[index].totalAmount;
                }
                uni.showToast({
                  title: "续租成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:283", "续租失败:", err);
                uni.showToast({
                  title: "续租失败",
                  icon: "error"
                });
              });
            }
          }
        });
      },
      // 退租功能
      returnRental(item) {
        uni.showModal({
          title: "退租",
          content: "请输入退租的金额变化",
          editable: true,
          placeholderText: "请输入金额",
          success: (res) => {
            if (res.confirm) {
              const changeAmount = parseFloat(res.content);
              if (isNaN(changeAmount) || changeAmount <= 0) {
                uni.showToast({
                  title: "输入格式错误，金额应为正数",
                  icon: "error"
                });
                return;
              }
              const baseAmount = item.changedTotalAmount || parseFloat(item.initialTotalAmount) || 0;
              const newTotalAmount = baseAmount - changeAmount;
              const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
              const sql = `UPDATE rental SET changeAmount = ?, changeAction = ?, changedTotalAmount = ?, updatedAt = ? WHERE id = ?`;
              const params = [changeAmount, "退租", newTotalAmount, updatedAt, item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].changeAmount = changeAmount;
                  this.rentalList[index].changeAction = "退租";
                  this.rentalList[index].changedTotalAmount = newTotalAmount;
                  this.rentalList[index].updatedAt = updatedAt;
                  delete this.rentalList[index].totalAmount;
                }
                uni.showToast({
                  title: "退租成功",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:336", "退租失败:", err);
                uni.showToast({
                  title: "退租失败",
                  icon: "error"
                });
              });
            }
          }
        });
      },
      // 一键完成租约
      completeRental(item) {
        uni.showModal({
          title: "确认完成",
          content: "确定要将此租约标记为已完成吗？",
          success: (res) => {
            if (res.confirm) {
              const sql = `UPDATE rental SET status = ? WHERE id = ?`;
              const params = ["已完成", item.id];
              executeSql(sql, params).then(() => {
                const index = this.rentalList.findIndex((r) => r.id === item.id);
                if (index !== -1) {
                  this.rentalList[index].status = "已完成";
                }
                uni.showToast({
                  title: "租约已完成",
                  icon: "success"
                });
              }).catch((err) => {
                formatAppLog("error", "at pages/rental/rental.vue:367", "完成租约失败:", err);
                uni.showToast({
                  title: "完成租约失败",
                  icon: "error"
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
        if (diff > 50) {
          this.showSlideAction = true;
          this.slideDirection = "left";
          this.slideId = this.currentId;
        } else if (diff < -50) {
          this.showSlideAction = true;
          this.slideDirection = "right";
          this.slideId = this.currentId;
        } else {
          this.showSlideAction = false;
        }
      },
      // 点击其他地方关闭滑动状态
      closeSlideAction() {
        this.showSlideAction = false;
        this.slideId = 0;
      },
      touchEnd() {
        this.startX = 0;
        this.endX = 0;
      }
    },
    computed: {
      filteredRentalList() {
        let filtered = this.rentalList;
        if (this.searchKeyword) {
          const keyword = this.searchKeyword.toLowerCase();
          filtered = filtered.filter(
            (item) => item.carName.toLowerCase().includes(keyword)
          );
        }
        const selectedStatus = this.statusOptions[this.selectedStatusIndex];
        if (selectedStatus !== "全部") {
          filtered = filtered.filter((item) => item.status === selectedStatus);
        }
        return filtered;
      }
    }
  };
  function _sfc_render$3(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", {
      class: "container",
      onClick: _cache[7] || (_cache[7] = (...args) => $options.closeSlideAction && $options.closeSlideAction(...args))
    }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("view", { class: "search-box" }, [
          vue.createElementVNode("text", { class: "search-icon" }, "🔍"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.searchKeyword = $event),
              placeholder: "按车名搜索",
              class: "search-input",
              onInput: _cache[1] || (_cache[1] = (...args) => $options.handleSearch && $options.handleSearch(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.searchKeyword]
          ])
        ]),
        vue.createElementVNode("button", {
          onClick: _cache[2] || (_cache[2] = (...args) => $options.addRental && $options.addRental(...args)),
          class: "add-btn"
        }, "添加租赁记录")
      ]),
      vue.createElementVNode("view", { class: "tab-section" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($data.statusOptions, (option, index) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: index,
              class: vue.normalizeClass(["tab-item", { active: $data.selectedStatusIndex === index }]),
              onClick: vue.withModifiers(($event) => $data.selectedStatusIndex = index, ["stop"])
            }, vue.toDisplayString(option), 11, ["onClick"]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", { class: "rental-list" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($options.filteredRentalList, (item) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              key: item.id,
              class: "rental-item"
            }, [
              vue.createElementVNode("view", { class: "rental-item-wrapper" }, [
                vue.createElementVNode("view", { class: "slide-actions-left" }, [
                  vue.createElementVNode("view", {
                    class: "slide-action edit-action",
                    onClick: vue.withModifiers(($event) => $options.editRental(item), ["stop"])
                  }, "编辑", 8, ["onClick"])
                ]),
                vue.createElementVNode("view", {
                  class: "item-content",
                  onTouchstart: _cache[3] || (_cache[3] = (...args) => $options.touchStart && $options.touchStart(...args)),
                  onTouchmove: _cache[4] || (_cache[4] = (...args) => $options.touchMove && $options.touchMove(...args)),
                  onTouchend: _cache[5] || (_cache[5] = (...args) => $options.touchEnd && $options.touchEnd(...args)),
                  onClick: _cache[6] || (_cache[6] = vue.withModifiers(() => {
                  }, ["stop"])),
                  "data-id": item.id,
                  style: vue.normalizeStyle({
                    transform: $data.showSlideAction && $data.slideId === item.id ? $data.slideDirection === "left" ? "translateX(-120rpx)" : "translateX(120rpx)" : "translateX(0)"
                  })
                }, [
                  vue.createElementVNode(
                    "text",
                    { class: "car-number" },
                    vue.toDisplayString(item.carName),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "rental-date" },
                    "租赁时间：" + vue.toDisplayString(item.startDate) + " 至 " + vue.toDisplayString(item.endDate),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "days" },
                    "租赁天数：" + vue.toDisplayString(item.days) + "天",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "daily-rate" },
                    "日租金：" + vue.toDisplayString(item.dailyRate) + "元",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("text", { class: "total-amount" }, [
                    vue.createTextVNode(
                      " 总金额：" + vue.toDisplayString(item.changedTotalAmount || item.initialTotalAmount || item.totalAmount) + "元 ",
                      1
                      /* TEXT */
                    ),
                    item.changeAction ? (vue.openBlock(), vue.createElementBlock(
                      "text",
                      {
                        key: 0,
                        class: "change-info"
                      },
                      " （" + vue.toDisplayString(item.changedTotalAmount || item.initialTotalAmount) + " " + vue.toDisplayString(item.changeAction) + " " + vue.toDisplayString(item.changeAmount) + " 于" + vue.toDisplayString($options.formatDateToDay(item.updatedAt)) + "） ",
                      1
                      /* TEXT */
                    )) : vue.createCommentVNode("v-if", true)
                  ]),
                  item.renterName || item.renterPhone ? (vue.openBlock(), vue.createElementBlock(
                    "text",
                    {
                      key: 0,
                      class: "renter-info"
                    },
                    " 租车人：" + vue.toDisplayString(item.renterName || "未填写") + " " + vue.toDisplayString(item.renterPhone ? "(" + item.renterPhone + ")" : ""),
                    1
                    /* TEXT */
                  )) : vue.createCommentVNode("v-if", true),
                  vue.createElementVNode(
                    "text",
                    {
                      class: vue.normalizeClass(["status", item.status === "已完成" ? "status-completed" : "status-active"])
                    },
                    " 状态：" + vue.toDisplayString(item.status),
                    3
                    /* TEXT, CLASS */
                  ),
                  vue.createElementVNode("view", { class: "item-actions" }, [
                    vue.createElementVNode("button", {
                      onClick: vue.withModifiers(($event) => $options.renewRental(item), ["stop"]),
                      class: "renew-btn"
                    }, "续租", 8, ["onClick"]),
                    vue.createElementVNode("button", {
                      onClick: vue.withModifiers(($event) => $options.returnRental(item), ["stop"]),
                      class: "return-btn"
                    }, "退租", 8, ["onClick"]),
                    item.status === "进行中" ? (vue.openBlock(), vue.createElementBlock("button", {
                      key: 0,
                      onClick: vue.withModifiers(($event) => $options.completeRental(item), ["stop"]),
                      class: "complete-btn"
                    }, "一键完成", 8, ["onClick"])) : vue.createCommentVNode("v-if", true)
                  ])
                ], 44, ["data-id"]),
                vue.createElementVNode("view", { class: "slide-actions-right" }, [
                  vue.createElementVNode("view", {
                    class: "slide-action delete-action",
                    onClick: vue.withModifiers(($event) => $options.deleteRental(item.id), ["stop"])
                  }, "删除", 8, ["onClick"])
                ])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        ))
      ])
    ]);
  }
  const PagesRentalRental = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$3], ["__scopeId", "data-v-c7393d3c"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/rental.vue"]]);
  const _sfc_main$3 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        rental: {
          startDate: "",
          endDate: "",
          days: "",
          dailyRate: "",
          initialTotalAmount: "",
          renterName: "",
          renterPhone: ""
        },
        autoCalculate: true,
        statusOptions: ["进行中", "已完成"],
        selectedStatusIndex: 0
      };
    },
    onLoad() {
      this.loadCarList();
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car`;
        query(sql).then((res) => {
          this.carList = res || [];
          if (this.carList.length > 0) {
            this.selectedCar = this.carList[0];
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/add-rental.vue:124", "加载车辆列表失败:", err);
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
          this.selectedCar = this.carList[0];
        });
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onStartDateChange(e) {
        this.startDate = e.detail.value;
        this.updateStartDateTime();
      },
      onStartTimeChange(e) {
        this.startTime = e.detail.value;
        this.updateStartDateTime();
      },
      onEndDateChange(e) {
        this.endDate = e.detail.value;
        this.updateEndDateTime();
      },
      onEndTimeChange(e) {
        this.endTime = e.detail.value;
        this.updateEndDateTime();
      },
      updateStartDateTime() {
        if (this.startDate && this.startTime) {
          this.rental.startDate = this.startDate + " " + this.startTime;
          this.calculateDays();
        }
      },
      updateEndDateTime() {
        if (this.endDate && this.endTime) {
          this.rental.endDate = this.endDate + " " + this.endTime;
          this.calculateDays();
        }
      },
      calculateDays() {
        if (this.rental.startDate && this.rental.endDate) {
          const start = new Date(this.rental.startDate);
          const end = new Date(this.rental.endDate);
          const diffTime = end - start;
          const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
          this.rental.days = diffDays > 0 ? diffDays : 1;
          this.calculateTotal();
        } else {
          this.rental.days = "";
        }
      },
      onDailyRateChange() {
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      calculateTotal() {
        if (this.autoCalculate && this.rental.days && this.rental.dailyRate) {
          const days = parseFloat(this.rental.days);
          const dailyRate = parseFloat(this.rental.dailyRate);
          this.rental.initialTotalAmount = (days * dailyRate).toFixed(2);
        }
      },
      onAutoCalculateChange(e) {
        this.autoCalculate = e.detail.value;
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      onStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      saveRental() {
        if (!this.selectedCar || !this.rental.startDate || !this.rental.endDate || !this.rental.days || !this.rental.dailyRate || !this.rental.initialTotalAmount) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        const sql = `INSERT INTO rental (carId, carName, startDate, endDate, days, dailyRate, initialTotalAmount, renterName, renterPhone, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          this.selectedCar.id,
          this.selectedCar.name,
          this.rental.startDate,
          this.rental.endDate,
          this.rental.days,
          this.rental.dailyRate,
          this.rental.initialTotalAmount,
          this.rental.renterName,
          this.rental.renterPhone,
          this.statusOptions[this.selectedStatusIndex],
          (/* @__PURE__ */ new Date()).toISOString()
        ];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "保存成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/add-rental.vue:238", "保存失败:", err);
          uni.showToast({
            title: "保存失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "开始时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onStartDateChange && $options.onStartDateChange(...args)),
              value: $data.startDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.startDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[2] || (_cache[2] = (...args) => $options.onStartTimeChange && $options.onStartTimeChange(...args)),
              value: $data.startTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.startTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "结束时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[3] || (_cache[3] = (...args) => $options.onEndDateChange && $options.onEndDateChange(...args)),
              value: $data.endDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.endDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[4] || (_cache[4] = (...args) => $options.onEndTimeChange && $options.onEndTimeChange(...args)),
              value: $data.endTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.endTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租赁天数"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $data.rental.days = $event),
              placeholder: "自动计算",
              class: "input",
              disabled: ""
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.days]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "日租金"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "digit",
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $data.rental.dailyRate = $event),
              placeholder: "请输入日租金",
              class: "input",
              onInput: _cache[7] || (_cache[7] = (...args) => $options.onDailyRateChange && $options.onDailyRateChange(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.dailyRate]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("view", { class: "label-row" }, [
            vue.createElementVNode("text", { class: "label" }, "总金额"),
            vue.createElementVNode("switch", {
              checked: $data.autoCalculate,
              onChange: _cache[8] || (_cache[8] = (...args) => $options.onAutoCalculateChange && $options.onAutoCalculateChange(...args)),
              color: "#007AFF"
            }, null, 40, ["checked"]),
            vue.createElementVNode(
              "text",
              { class: "switch-label" },
              vue.toDisplayString($data.autoCalculate ? "自动计算" : "手动输入"),
              1
              /* TEXT */
            )
          ]),
          vue.withDirectives(vue.createElementVNode("input", {
            type: "digit",
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => $data.rental.initialTotalAmount = $event),
            placeholder: "请输入总金额",
            class: "input",
            disabled: $data.autoCalculate
          }, null, 8, ["disabled"]), [
            [vue.vModelText, $data.rental.initialTotalAmount]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人姓名"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => $data.rental.renterName = $event),
              placeholder: "请输入租车人姓名（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterName]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人电话"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => $data.rental.renterPhone = $event),
              placeholder: "请输入租车人电话（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterPhone]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "状态"),
          vue.createElementVNode("picker", {
            range: $data.statusOptions,
            onChange: _cache[12] || (_cache[12] = (...args) => $options.onStatusChange && $options.onStatusChange(...args)),
            value: $data.selectedStatusIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.statusOptions[$data.selectedStatusIndex]),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[13] || (_cache[13] = (...args) => $options.saveRental && $options.saveRental(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[14] || (_cache[14] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesRentalAddRental = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2], ["__scopeId", "data-v-4d28a5ee"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/add-rental.vue"]]);
  const _sfc_main$2 = {
    data() {
      return {
        carList: [],
        selectedCarIndex: 0,
        selectedCar: null,
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        rental: {
          id: "",
          startDate: "",
          endDate: "",
          days: "",
          dailyRate: "",
          initialTotalAmount: "",
          renterName: "",
          renterPhone: "",
          status: ""
        },
        autoCalculate: true,
        statusOptions: ["进行中", "已完成"],
        selectedStatusIndex: 0
      };
    },
    onLoad(options) {
      this.rental.id = parseInt(options.id);
      this.loadCarList();
      this.loadRentalInfo();
    },
    methods: {
      loadCarList() {
        const sql = `SELECT * FROM car`;
        query(sql).then((res) => {
          this.carList = res || [];
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:125", "加载车辆列表失败:", err);
          this.carList = [
            {
              id: 1,
              name: "丰田凯美瑞"
            },
            {
              id: 2,
              name: "本田雅阁"
            }
          ];
        });
      },
      loadRentalInfo() {
        const sql = `SELECT * FROM rental WHERE id = ?`;
        query(sql, [this.rental.id]).then((res) => {
          if (res && res.length > 0) {
            this.rental = res[0];
            if (this.rental.startDate) {
              const startParts = this.rental.startDate.split(" ");
              if (startParts.length === 2) {
                this.startDate = startParts[0];
                this.startTime = startParts[1];
              }
            }
            if (this.rental.endDate) {
              const endParts = this.rental.endDate.split(" ");
              if (endParts.length === 2) {
                this.endDate = endParts[0];
                this.endTime = endParts[1];
              }
            }
            const carIndex = this.carList.findIndex((car) => car.id === this.rental.carId);
            if (carIndex !== -1) {
              this.selectedCarIndex = carIndex;
              this.selectedCar = this.carList[carIndex];
            }
            this.selectedStatusIndex = this.statusOptions.indexOf(this.rental.status);
          }
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:170", "加载租赁信息失败:", err);
          this.rental = {
            id: this.rental.id,
            startDate: "2026-04-01 08:00",
            endDate: "2026-04-05 18:00",
            days: 5,
            dailyRate: 300,
            initialTotalAmount: 1500,
            renterName: "张三",
            renterPhone: "13800138000",
            status: "已完成"
          };
          this.startDate = "2026-04-01";
          this.startTime = "08:00";
          this.endDate = "2026-04-05";
          this.endTime = "18:00";
          this.selectedCar = this.carList[0];
          this.selectedStatusIndex = this.statusOptions.indexOf(this.rental.status);
        });
      },
      onCarChange(e) {
        this.selectedCarIndex = e.detail.value;
        this.selectedCar = this.carList[this.selectedCarIndex];
      },
      onStartDateChange(e) {
        this.startDate = e.detail.value;
        this.updateStartDateTime();
      },
      onStartTimeChange(e) {
        this.startTime = e.detail.value;
        this.updateStartDateTime();
      },
      onEndDateChange(e) {
        this.endDate = e.detail.value;
        this.updateEndDateTime();
      },
      onEndTimeChange(e) {
        this.endTime = e.detail.value;
        this.updateEndDateTime();
      },
      updateStartDateTime() {
        if (this.startDate && this.startTime) {
          this.rental.startDate = this.startDate + " " + this.startTime;
          this.calculateDays();
        }
      },
      updateEndDateTime() {
        if (this.endDate && this.endTime) {
          this.rental.endDate = this.endDate + " " + this.endTime;
          this.calculateDays();
        }
      },
      calculateDays() {
        if (this.rental.startDate && this.rental.endDate) {
          const start = new Date(this.rental.startDate);
          const end = new Date(this.rental.endDate);
          const diffTime = end - start;
          const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
          this.rental.days = diffDays > 0 ? diffDays : 1;
          this.calculateTotal();
        } else {
          this.rental.days = "";
        }
      },
      onDailyRateChange() {
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      calculateTotal() {
        if (this.autoCalculate && this.rental.days && this.rental.dailyRate) {
          const days = parseFloat(this.rental.days);
          const dailyRate = parseFloat(this.rental.dailyRate);
          this.rental.initialTotalAmount = (days * dailyRate).toFixed(2);
        }
      },
      onAutoCalculateChange(e) {
        this.autoCalculate = e.detail.value;
        if (this.autoCalculate) {
          this.calculateTotal();
        }
      },
      onStatusChange(e) {
        this.selectedStatusIndex = e.detail.value;
      },
      updateRental() {
        if (!this.selectedCar || !this.rental.startDate || !this.rental.endDate || !this.rental.days || !this.rental.dailyRate || !this.rental.initialTotalAmount) {
          uni.showToast({
            title: "请填写完整信息",
            icon: "none"
          });
          return;
        }
        const sql = `UPDATE rental SET carId = ?, carName = ?, startDate = ?, endDate = ?, days = ?, dailyRate = ?, initialTotalAmount = ?, renterName = ?, renterPhone = ?, status = ? WHERE id = ?`;
        const params = [
          this.selectedCar.id,
          this.selectedCar.name,
          this.rental.startDate,
          this.rental.endDate,
          this.rental.days,
          this.rental.dailyRate,
          this.rental.initialTotalAmount,
          this.rental.renterName,
          this.rental.renterPhone,
          this.statusOptions[this.selectedStatusIndex],
          this.rental.id
        ];
        executeSql(sql, params).then(() => {
          uni.showToast({
            title: "更新成功",
            icon: "success"
          });
          uni.navigateBack();
        }).catch((err) => {
          formatAppLog("error", "at pages/rental/edit-rental.vue:291", "更新失败:", err);
          uni.showToast({
            title: "更新失败",
            icon: "none"
          });
        });
      },
      cancel() {
        uni.navigateBack();
      }
    }
  };
  function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
    var _a;
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "form" }, [
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "车名"),
          vue.createElementVNode("picker", {
            range: $data.carList,
            "range-key": "name",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onCarChange && $options.onCarChange(...args)),
            value: $data.selectedCarIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString(((_a = $data.selectedCar) == null ? void 0 : _a.name) || "请选择车辆"),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "开始时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onStartDateChange && $options.onStartDateChange(...args)),
              value: $data.startDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.startDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[2] || (_cache[2] = (...args) => $options.onStartTimeChange && $options.onStartTimeChange(...args)),
              value: $data.startTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.startTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "结束时间"),
          vue.createElementVNode("view", { class: "datetime-picker" }, [
            vue.createElementVNode("picker", {
              mode: "date",
              onChange: _cache[3] || (_cache[3] = (...args) => $options.onEndDateChange && $options.onEndDateChange(...args)),
              value: $data.endDate
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker date-picker" },
                vue.toDisplayString($data.endDate || "请选择日期"),
                1
                /* TEXT */
              )
            ], 40, ["value"]),
            vue.createElementVNode("picker", {
              mode: "time",
              onChange: _cache[4] || (_cache[4] = (...args) => $options.onEndTimeChange && $options.onEndTimeChange(...args)),
              value: $data.endTime
            }, [
              vue.createElementVNode(
                "view",
                { class: "picker time-picker" },
                vue.toDisplayString($data.endTime || "时间"),
                1
                /* TEXT */
              )
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租赁天数"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $data.rental.days = $event),
              placeholder: "自动计算",
              class: "input",
              disabled: ""
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.days]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "日租金"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "digit",
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $data.rental.dailyRate = $event),
              placeholder: "请输入日租金",
              class: "input",
              onInput: _cache[7] || (_cache[7] = (...args) => $options.onDailyRateChange && $options.onDailyRateChange(...args))
            },
            null,
            544
            /* NEED_HYDRATION, NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.dailyRate]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("view", { class: "label-row" }, [
            vue.createElementVNode("text", { class: "label" }, "总金额"),
            vue.createElementVNode("switch", {
              checked: $data.autoCalculate,
              onChange: _cache[8] || (_cache[8] = (...args) => $options.onAutoCalculateChange && $options.onAutoCalculateChange(...args)),
              color: "#007AFF"
            }, null, 40, ["checked"]),
            vue.createElementVNode(
              "text",
              { class: "switch-label" },
              vue.toDisplayString($data.autoCalculate ? "自动计算" : "手动输入"),
              1
              /* TEXT */
            )
          ]),
          vue.withDirectives(vue.createElementVNode("input", {
            type: "digit",
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => $data.rental.initialTotalAmount = $event),
            placeholder: "请输入总金额",
            class: "input",
            disabled: $data.autoCalculate
          }, null, 8, ["disabled"]), [
            [vue.vModelText, $data.rental.initialTotalAmount]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人姓名"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "text",
              "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => $data.rental.renterName = $event),
              placeholder: "请输入租车人姓名（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterName]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "租车人电话"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              type: "number",
              "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => $data.rental.renterPhone = $event),
              placeholder: "请输入租车人电话（选填）",
              class: "input"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $data.rental.renterPhone]
          ])
        ]),
        vue.createElementVNode("view", { class: "form-item" }, [
          vue.createElementVNode("text", { class: "label" }, "状态"),
          vue.createElementVNode("picker", {
            range: $data.statusOptions,
            onChange: _cache[12] || (_cache[12] = (...args) => $options.onStatusChange && $options.onStatusChange(...args)),
            value: $data.selectedStatusIndex
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.statusOptions[$data.selectedStatusIndex]),
              1
              /* TEXT */
            )
          ], 40, ["range", "value"])
        ]),
        vue.createElementVNode("view", { class: "button-group" }, [
          vue.createElementVNode("button", {
            onClick: _cache[13] || (_cache[13] = (...args) => $options.updateRental && $options.updateRental(...args)),
            class: "save-btn"
          }, "保存"),
          vue.createElementVNode("button", {
            onClick: _cache[14] || (_cache[14] = (...args) => $options.cancel && $options.cancel(...args)),
            class: "cancel-btn"
          }, "取消")
        ])
      ])
    ]);
  }
  const PagesRentalEditRental = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1], ["__scopeId", "data-v-2d0021ad"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/rental/edit-rental.vue"]]);
  const _sfc_main$1 = {
    data() {
      return {
        selectedDate: "2026-04",
        monthlyIncome: 0,
        yearlyIncome: 0,
        totalIncome: 0,
        monthlyData: [],
        carData: []
      };
    },
    onLoad() {
      this.loadStatistics();
      this.loadMonthlyData();
      this.loadCarData();
    },
    onShow() {
      this.loadStatistics();
      this.loadMonthlyData();
      this.loadCarData();
    },
    methods: {
      onDateChange(e) {
        this.selectedDate = e.detail.value;
        this.loadStatistics();
      },
      loadStatistics() {
        const monthlySql = `SELECT SUM(CASE WHEN changedTotalAmount IS NOT NULL THEN changedTotalAmount ELSE initialTotalAmount END) as total FROM rental WHERE substr(startDate, 1, 7) = ?`;
        query(monthlySql, [this.selectedDate]).then((res) => {
          this.monthlyIncome = res && res[0] && res[0].total ? parseFloat(res[0].total).toFixed(2) : 0;
        }).catch((err) => {
          formatAppLog("error", "at pages/statistics/statistics.vue:97", "加载月度租赁收入失败:", err);
          this.monthlyIncome = "3600.00";
        });
        const year = this.selectedDate.substring(0, 4);
        const yearlySql = `SELECT SUM(CASE WHEN changedTotalAmount IS NOT NULL THEN changedTotalAmount ELSE initialTotalAmount END) as total FROM rental WHERE substr(startDate, 1, 4) = ?`;
        query(yearlySql, [year]).then((res) => {
          this.yearlyIncome = res && res[0] && res[0].total ? parseFloat(res[0].total).toFixed(2) : 0;
        }).catch((err) => {
          formatAppLog("error", "at pages/statistics/statistics.vue:108", "加载年度租赁收入失败:", err);
          this.yearlyIncome = "43200.00";
        });
        const totalSql = `SELECT SUM(CASE WHEN changedTotalAmount IS NOT NULL THEN changedTotalAmount ELSE initialTotalAmount END) as total FROM rental`;
        query(totalSql).then((res) => {
          this.totalIncome = res && res[0] && res[0].total ? parseFloat(res[0].total).toFixed(2) : 0;
        }).catch((err) => {
          formatAppLog("error", "at pages/statistics/statistics.vue:118", "加载总租赁收入失败:", err);
          this.totalIncome = "43200.00";
        });
      },
      loadMonthlyData() {
        const monthlySql = `SELECT substr(startDate, 1, 7) as month, SUM(CASE WHEN changedTotalAmount IS NOT NULL THEN changedTotalAmount ELSE initialTotalAmount END) as income FROM rental GROUP BY month ORDER BY month`;
        query(monthlySql).then((res) => {
          this.monthlyData = res.map((item) => ({
            month: item.month,
            income: parseFloat(item.income).toFixed(2)
          }));
        }).catch((err) => {
          formatAppLog("error", "at pages/statistics/statistics.vue:132", "加载按月收入统计失败:", err);
          this.monthlyData = [
            { month: "2026-01", income: "3000.00" },
            { month: "2026-02", income: "2500.00" },
            { month: "2026-03", income: "4000.00" },
            { month: "2026-04", income: "3600.00" },
            { month: "2026-05", income: "4200.00" },
            { month: "2026-06", income: "3800.00" }
          ];
        });
      },
      loadCarData() {
        const carSql = `SELECT carName, SUM(CASE WHEN changedTotalAmount IS NOT NULL THEN changedTotalAmount ELSE initialTotalAmount END) as income, COUNT(*) as count FROM rental GROUP BY carName ORDER BY income DESC`;
        query(carSql).then((res) => {
          this.carData = res.map((item) => ({
            carName: item.carName,
            income: parseFloat(item.income).toFixed(2),
            count: item.count
          }));
        }).catch((err) => {
          formatAppLog("error", "at pages/statistics/statistics.vue:154", "加载按车名收入统计失败:", err);
          this.carData = [
            { carName: "大众朗逸", income: "18000.00", count: 5 },
            { carName: "丰田凯美瑞", income: "15000.00", count: 4 },
            { carName: "本田雅阁", income: "10200.00", count: 3 }
          ];
        });
      }
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("text", { class: "title" }, "统计报表"),
        vue.createElementVNode("view", { class: "date-selector" }, [
          vue.createElementVNode("picker", {
            mode: "date",
            fields: "month",
            onChange: _cache[0] || (_cache[0] = (...args) => $options.onDateChange && $options.onDateChange(...args)),
            value: $data.selectedDate
          }, [
            vue.createElementVNode(
              "view",
              { class: "picker" },
              vue.toDisplayString($data.selectedDate),
              1
              /* TEXT */
            )
          ], 40, ["value"])
        ])
      ]),
      vue.createElementVNode("view", { class: "stats-card" }, [
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "月度租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.monthlyIncome) + "元",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "年度租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.yearlyIncome) + "元",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "stat-item" }, [
          vue.createElementVNode("text", { class: "stat-label" }, "总租赁收入"),
          vue.createElementVNode(
            "text",
            { class: "stat-value" },
            vue.toDisplayString($data.totalIncome) + "元",
            1
            /* TEXT */
          )
        ])
      ]),
      vue.createElementVNode("view", { class: "table-section" }, [
        vue.createElementVNode("text", { class: "section-title" }, "按月收入统计"),
        vue.createElementVNode("view", { class: "table-container" }, [
          vue.createElementVNode("view", { class: "table-header" }, [
            vue.createElementVNode("view", { class: "table-cell" }, "月份"),
            vue.createElementVNode("view", { class: "table-cell" }, "收入(元)")
          ]),
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.monthlyData, (item) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: item.month,
                class: "table-row"
              }, [
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.month),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.income),
                  1
                  /* TEXT */
                )
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ]),
      vue.createElementVNode("view", { class: "table-section" }, [
        vue.createElementVNode("text", { class: "section-title" }, "按车名收入统计"),
        vue.createElementVNode("view", { class: "table-container" }, [
          vue.createElementVNode("view", { class: "table-header" }, [
            vue.createElementVNode("view", { class: "table-cell" }, "车名"),
            vue.createElementVNode("view", { class: "table-cell" }, "收入(元)"),
            vue.createElementVNode("view", { class: "table-cell" }, "租约数")
          ]),
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.carData, (item) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: item.carName,
                class: "table-row"
              }, [
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.carName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.income),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "view",
                  { class: "table-cell" },
                  vue.toDisplayString(item.count),
                  1
                  /* TEXT */
                )
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ])
    ]);
  }
  const PagesStatisticsStatistics = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__scopeId", "data-v-fc23ec97"], ["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/pages/statistics/statistics.vue"]]);
  __definePage("pages/index/index", PagesIndexIndex);
  __definePage("pages/index/add-car", PagesIndexAddCar);
  __definePage("pages/index/edit-car", PagesIndexEditCar);
  __definePage("pages/insurance/insurance", PagesInsuranceInsurance);
  __definePage("pages/insurance/add-insurance", PagesInsuranceAddInsurance);
  __definePage("pages/insurance/edit-insurance", PagesInsuranceEditInsurance);
  __definePage("pages/maintenance/maintenance", PagesMaintenanceMaintenance);
  __definePage("pages/maintenance/add-maintenance", PagesMaintenanceAddMaintenance);
  __definePage("pages/maintenance/edit-maintenance", PagesMaintenanceEditMaintenance);
  __definePage("pages/rental/rental", PagesRentalRental);
  __definePage("pages/rental/add-rental", PagesRentalAddRental);
  __definePage("pages/rental/edit-rental", PagesRentalEditRental);
  __definePage("pages/statistics/statistics", PagesStatisticsStatistics);
  const _sfc_main = {
    onLaunch: function() {
      formatAppLog("log", "at App.vue:5", "App Launch");
      this.initDatabase();
    },
    onShow: function() {
      formatAppLog("log", "at App.vue:10", "App Show");
    },
    onHide: function() {
      formatAppLog("log", "at App.vue:13", "App Hide");
    },
    methods: {
      initDatabase() {
        initDb().then(() => {
          formatAppLog("log", "at App.vue:21", "数据库初始化成功");
        }).catch((err) => {
          formatAppLog("warn", "at App.vue:23", "数据库初始化失败，使用模拟数据:", err);
          formatAppLog("log", "at App.vue:25", "使用模拟数据");
        });
      }
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "D:/newLearn/new_vue/projects/rentApp/rentData/App.vue"]]);
  function createApp() {
    const app = vue.createVueApp(App);
    return {
      app
    };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);

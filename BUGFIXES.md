# Bug修复总结

## 🐛 已修复的问题

### 1. ✅ StateManager作用域错误
**症状：** Console显示`stateManager is not defined`

**Root Cause：** 
- `persistSessions()`等函数定义在`bootstrap()`外部
- 无法访问bootstrap内的stateManager变量

**修复：**
```javascript
// ❌ 之前：在bootstrap外部
}
function persistSessions() { ... }

// ✅ 现在：移到bootstrap内部
  function persistSessions() { ... }
  init().catch(...);
}
```

**文件：** `extension/src/content.js`

---

### 2. ✅ Auto-Inject不重新注入
**症状：** 刷新页面后content script未运行

**Root Cause：** 
```javascript
if (injectedTabs.has(tabId)) return; // 阻止重新注入
// 但页面刷新后tabId未清除
```

**修复：**
```javascript
if (changeInfo.status === 'loading') {
  injectedTabs.delete(tabId); // 清除标记
  return;
}
```

**文件：** `extension/background.js`

---

### 3. ✅ 禁用自动打开Dock
**需求：** 用户不希望刷新后自动打开Dock

**修复：** 移除auto-inject中的自动TOGGLE_BUBBLE逻辑

**文件：** `extension/background.js`

---

### 4. ✅ ProjectId竞态条件
**症状：** Storage key变成`lumi.sessions:undefined:localhost:3000`

**Root Cause：** 
- ProjectId来自异步HealthCheck
- persistSessions可能在projectId返回前调用

**修复：** 简化key结构
```javascript
// ❌ 之前：依赖projectId
const key = `lumi.sessions:${projectId}:${host}`;

// ✅ 现在：仅用host
const key = `lumi.sessions:${host}`;
```

**Trade-off：** 同域名多项目会混在一起，但避免了竞态

**文件：** `extension/src/content.js`

---

### 5. ✅ 缓存未刷新
**症状：** 代码更新后仍显示旧版本

**原因：** Chrome Extension缓存机制
- Background立即重载
- Content script不重载（直到页面刷新）

**解决方案：**
1. chrome://extensions → 刷新按钮
2. **重要：刷新所有tab页面**
3. 或使用`chrome.runtime.reload()`

---

## 📊 调试日志增强

### 新增Debug输出
```javascript
console.log('[LUMI] Restoring sessions from key:', key);
console.log('[LUMI] Restored payload:', payload);
console.log('[LUMI] Sessions restored:', payload.list.length, 'sessions');
console.log('[LUMI] Persisting sessions to key:', key, 'count:', list.length);
```

### 验证持久化
```javascript
// 在Console中运行
chrome.storage.local.get(null, (items) => {
  console.log('All storage:', items);
  // 应该看到 lumi.sessions:localhost:3000
});
```

---

## 🎯 测试验证步骤

### 1. 刷新Extension
```
chrome://extensions → 点击刷新按钮
```

### 2. 清空旧数据（可选）
```javascript
// Console中运行
chrome.storage.local.clear(() => {
  console.log('Storage cleared');
});
```

### 3. 发送测试消息
1. 打开mapped host（如localhost:3000）
2. 点击Extension图标打开Dock
3. 发送一条消息："测试持久化"
4. 查看Console日志

### 4. 刷新页面验证
1. 刷新页面（F5）
2. 查看Console：
   ```
   [LUMI] Restoring sessions from key: lumi.sessions:localhost:3000
   [LUMI] Restored payload: {list: [...], currentId: "s123", t: 1234567890}
   [LUMI] Sessions restored: 1 sessions
   ```
3. 点击Extension图标打开Dock
4. 切换到History tab
5. 应该看到"测试持久化"session

---

## ⚠️ 已知限制

### 1. 多项目同域名冲突
**问题：** 
```
localhost:3000 → ProjectA的sessions
localhost:3000 → ProjectB的sessions
→ 混在一起
```

**临时解决方案：** 在UI层过滤（未实现）

**长期方案：** 
- 方案A：Background持久化（见docs/chrome-extension-persistence-root-cause.md）
- 方案B：延迟restore直到projectId可用

### 2. Storage配额限制
**Chrome限制：** 
- chrome.storage.local: 10MB
- 超出会静默失败

**建议：** 
- 限制sessions数量（如最多50个）
- 定期清理旧sessions

### 3. Service Worker回收
**Manifest V3问题：** Background service worker可能被Chrome回收

**影响：** 如果使用Background持久化方案，需要处理重启

---

## 📝 开发建议

### 强制刷新Extension的正确步骤
```
1. chrome://extensions → 刷新Extension
2. 关闭所有已打开的mapped host tabs
3. 重新打开tabs
4. 点击Extension图标
```

### 避免缓存问题
```
1. 每次修改代码后rebuild
2. 刷新Extension
3. 硬刷新所有相关页面（Ctrl+Shift+R）
```

### Debug技巧
```javascript
// 查看storage内容
chrome.storage.local.get(null, console.log);

// 监听storage变化
chrome.storage.onChanged.addListener((changes, area) => {
  console.log('Storage changed:', area, changes);
});

// 查看当前state
window.__lumiEventBus.emit('debug:dump-state');
```

---

## 🚀 下一步

### 短期（已完成）：
- ✅ 修复stateManager作用域
- ✅ 简化storage key
- ✅ 增加debug日志
- ✅ 修复auto-inject

### 中期（待实现）：
- [ ] 实现SSE流式输出
- [ ] Thinking实时显示
- [ ] Background持久化方案

### 长期（计划中）：
- [ ] IndexedDB替代chrome.storage
- [ ] 云端备份
- [ ] Session搜索功能

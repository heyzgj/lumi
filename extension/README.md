# LUMI Extension - 模块化重构

## 🎯 项目状态

**重构进度**: ~40%  
**当前状态**: 基础设施完成，核心模块部分完成  
**可用性**: 原版 content.js 仍可正常使用

---

## 📁 新架构目录

```
extension/
├── content.js              # 原版 (1803行, 仍在使用)
├── content.js.backup       # 备份
├── lib/                    # 新模块化代码
│   ├── core/              # ✅ 完成
│   │   ├── EventBus.js
│   │   └── StateManager.js
│   ├── ui/                # 🔄 部分完成
│   │   ├── styles.js
│   │   ├── TopBanner.js
│   │   ├── BubbleUI.js    # ⏳ 待完成
│   │   └── ContextTags.js # ⏳ 待完成
│   ├── selection/         # 🔄 部分完成
│   │   ├── HighlightManager.js
│   │   ├── ElementSelector.js    # ⏳ 待完成
│   │   └── ScreenshotSelector.js # ⏳ 待完成
│   ├── engine/            # ⏳ 待完成
│   │   ├── EngineManager.js
│   │   └── HealthChecker.js
│   ├── communication/     # 🔄 部分完成
│   │   ├── ChromeBridge.js
│   │   └── ServerClient.js # ⏳ 待完成
│   └── utils/             # 🔄 部分完成
│       ├── dom.js
│       └── selectors.js   # ⏳ 待完成
└── tests/                 # ✅ 框架完成
    ├── setup.js
    └── unit/
        ├── EventBus.test.js
        ├── StateManager.test.js
        ├── TopBanner.test.js
        └── dom.test.js
```

---

## 🚀 快速开始

### 安装依赖

```bash
cd extension
npm install
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 当前测试覆盖率

- ✅ EventBus: 100%
- ✅ StateManager: 100%
- ✅ TopBanner: 100%
- ✅ dom.js: 100%

---

## 📋 下一步工作

详见 `docs/REFACTORING_STATUS.md` 获取完整清单。

### 关键待完成模块

1. **ContextTags** (高优先级)
   - 管理 Context Tags UI
   - 内联芯片插入逻辑
   - 修复空格问题

2. **BubbleUI** (高优先级)
   - 主 Bubble UI 组件
   - Shadow DOM 管理
   - 引擎选择器
   - 拖拽功能

3. **ElementSelector & ScreenshotSelector** (高优先级)
   - 元素/截图选择逻辑
   - 与 HighlightManager 集成

4. **EngineManager & HealthChecker** (高优先级)
   - 引擎管理和健康检查
   - 修复竞态条件 bug

5. **ServerClient** (高优先级)
   - 服务器通信封装
   - Context 构建

6. **新 content.js** (最终集成)
   - 模块编排
   - 事件绑定
   - 完整功能

---

## 🧪 测试指南

### 编写新测试

所有测试文件放在 `tests/unit/` 目录下：

```javascript
// tests/unit/MyModule.test.js
import MyModule from '../../lib/path/MyModule.js';

describe('MyModule', () => {
  it('should do something', () => {
    const module = new MyModule();
    expect(module.doSomething()).toBe(true);
  });
});
```

### 测试最佳实践

1. **每个模块都有对应测试文件**
2. **测试覆盖率目标**:
   - 核心模块: 90%+
   - UI 模块: 70%+
   - 工具函数: 90%+
3. **使用描述性测试名称**
4. **隔离测试（不依赖其他测试）**

---

## 🏗️ 模块开发指南

### 设计原则

1. **单一职责**: 每个模块只负责一个功能领域
2. **依赖注入**: 通过构造函数传递依赖
3. **事件驱动**: 模块间通过 EventBus 通信
4. **可测试性**: 所有逻辑可独立测试

### 模块模板

```javascript
/**
 * ModuleName - Brief description
 */

export default class ModuleName {
  constructor(eventBus, stateManager, ...dependencies) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    
    // Setup event listeners
    this.setupListeners();
  }

  setupListeners() {
    this.eventBus.on('some:event', this.handleEvent.bind(this));
  }

  handleEvent(data) {
    // Handle event
    this.stateManager.set('path.to.value', data);
    this.eventBus.emit('another:event', result);
  }

  // Public methods
  publicMethod() {
    // Implementation
  }

  // Lifecycle
  destroy() {
    // Cleanup resources
    // Remove event listeners
    // Remove DOM elements
  }
}
```

---

## 🐛 Bug 修复状态

| Bug | 状态 | 位置 |
|-----|------|------|
| updateEngineStatus 缺失 | ✅ 已修复 | content.js:1723 |
| 引擎选择被覆盖 | 🔄 进行中 | EngineManager + HealthChecker |
| 状态同步问题 | ✅ 已解决 | StateManager |
| 事件监听器泄漏 | 🔄 进行中 | 各模块 destroy() |
| 内联芯片空格问题 | 📝 待处理 | ContextTags |

---

## 📚 参考资料

- **重构详细状态**: `docs/REFACTORING_STATUS.md`
- **任务清单**: `docs/TASKS.md`
- **PRD**: `docs/prd.md`
- **UI 指南**: `docs/UI_GUIDE.md`

---

## 💡 提示

### 使用原版 content.js

当前的 `content.js` 仍然完全可用。重构完成前，扩展将继续使用此文件。

### 切换到新版本

重构完成后，新的 `content.js` 将自动替换旧版本。旧版本已备份为 `content.js.backup`。

### 开发流程

1. 实现新模块
2. 编写单元测试
3. 确保测试通过
4. 更新 REFACTORING_STATUS.md
5. 提交代码

---

**预计剩余工作**: 4-5 小时编码 + 2 小时测试  
**目标完成日期**: 根据你的时间安排

有问题查看 `docs/REFACTORING_STATUS.md` 或提出问题！



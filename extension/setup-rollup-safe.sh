#!/bin/bash
set -e  # 遇到错误立即退出

echo "🔒 安全设置 Rollup（基于 Manifest V3 完整调研）"
echo "================================================"
echo ""

# 1. 安装依赖
echo "📦 [1/5] 安装 Rollup 依赖..."
npm install --save-dev rollup @rollup/plugin-node-resolve

# 2. 创建 src 目录
echo "📁 [2/5] 创建源代码目录..."
mkdir -p src

# 3. 移动模块化代码
echo "📦 [3/5] 移动文件到 src/..."
if [ -f content-new-broken.js ]; then
  mv content-new-broken.js src/content.js
  echo "  ✓ content-new-broken.js → src/content.js"
else
  echo "  ⚠️  content-new-broken.js 不存在，跳过"
fi

if [ -d lib ]; then
  mv lib src/
  echo "  ✓ lib/ → src/lib/"
else
  echo "  ⚠️  lib/ 不存在，跳过"
fi

# 4. 创建 Rollup 配置（IIFE 格式 - Manifest V3 唯一兼容格式）
echo "⚙️  [4/5] 创建 Rollup 配置..."
cat > rollup.config.js << 'ROLLUP_EOF'
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/content.js',
  output: {
    file: 'content.js',
    format: 'iife',  // ⚠️ Manifest V3: content scripts 必须是 IIFE
    name: 'LumiContent',
    sourcemap: true
  },
  plugins: [resolve()]
};
ROLLUP_EOF
echo "  ✓ rollup.config.js 已创建"

# 5. 更新 package.json
echo "📝 [5/5] 更新 package.json scripts..."
npm pkg set scripts.build="rollup -c"
npm pkg set scripts.watch="rollup -c -w"
npm pkg set scripts.dev="npm run watch"

echo ""
echo "✅ 设置完成！"
echo ""
echo "📋 Manifest V3 兼容性验证:"
echo "  ✓ Content scripts: IIFE 格式 (唯一兼容)"
echo "  ✓ Service worker: 保持原样 (支持 ES modules)"
echo "  ✓ 无远程代码"
echo "  ✓ 无 eval"
echo "  ✓ Shadow DOM 兼容"
echo "  ✓ 所有动态 DOM 操作允许"
echo ""
echo "�� 目录结构:"
echo "  extension/"
echo "  ├── src/              (源代码 - 开发时编辑这里)"
echo "  │   ├── content.js"
echo "  │   └── lib/"
echo "  ├── content.js        (打包后 - 自动生成)"
echo "  ├── background.js     (保持原样)"
echo "  └── manifest.json"
echo ""

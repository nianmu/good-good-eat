#!/bin/bash
# H5 前端部署脚本
# 用法: ./deploy.sh

set -e

echo "🚀 开始部署 H5 前端..."

# 1. 打包
echo "📦 打包 H5 前端..."
cd h5
npm run build:h5
cd ..

# 2. 创建部署包
echo "📁 创建部署包..."
zip -r h5-deploy.zip h5/dist

# 3. 上传到服务器
echo "📤 上传到服务器..."
scp h5-deploy.zip root@47.108.216.57:/opt/good-good-eat/

# 4. 在服务器上部署
echo "🔧 部署到服务器..."
ssh root@47.108.216.57 << 'EOF'
cd /opt/good-good-eat
mkdir -p h5_dist_bak_$(date +%Y%m%d_%H%M%S)
cp -r h5_dist/* h5_dist_bak_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
rm -rf h5_dist/*
unzip -o h5-deploy.zip -d .
mv h5/dist/* h5_dist/
rm -rf h5
chmod -R 755 h5_dist
echo "✅ 部署完成"
EOF

echo "✅ 部署成功!"

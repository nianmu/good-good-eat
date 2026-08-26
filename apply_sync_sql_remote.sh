#!/usr/bin/env bash
# 线上执行 HowToCook 同步 SQL（新流程演示）
set -e
cd /opt/good-good-eat
echo "== 1/2 更新 seed 脚本 =="
unzip -o -q server-deploy.zip -d server/
ls server/seed/export_howtocook_sql.py

echo "== 2/2 执行同步 SQL（幂等） =="
mysql -uroot good_good_eat < howtocook_sync_20260826_183753.sql
echo "SQL-OK"

echo "== 验证 =="
mysql -uroot -N -e "SELECT CONCAT('dishes=', COUNT(*)) FROM good_good_eat.dishes;"
mysql -uroot -N -e "SELECT CONCAT('categories=', COUNT(*)) FROM good_good_eat.categories;"
mysql -uroot -N -e "SELECT CONCAT('public_recipes=', COUNT(*)) FROM good_good_eat.recipes WHERE is_public=1;"
mysql -uroot -N -e "SELECT CONCAT('official=', COUNT(*)) FROM good_good_eat.users WHERE user_code='OFFICIAL';"
"""生成小程序 TabBar 图标（81×81 PNG，未选中灰 / 选中绿）。

用法：
  cd server && $env:UV_CACHE_DIR='E:/ai-repository/good-good-eat/.uv-cache'
  uv run --with pillow python ../tools/gen_tabbar_icons.py

输出：miniprogram/assets/tabbar/*.png（8 个）
说明：微信 tabBar 图标要求 81×81px PNG；本脚本用 PIL 矢量绘制，
      改色只需调 INACTIVE / ACTIVE 两常量后重跑。
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

SIZE = 81
INACTIVE = (155, 155, 155, 255)   # 未选中 #9B9B9B
ACTIVE = (76, 175, 80, 255)       # 选中 主绿 #4CAF50

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "assets", "tabbar")


def new_canvas() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def draw_book(d: ImageDraw.ImageDraw, color: tuple) -> None:
    """菜谱：书本（圆角矩形 + 中缝 + 两行文字线）"""
    # 书页轮廓
    d.rounded_rectangle([24, 20, 57, 62], radius=4, outline=color, width=4)
    # 中缝
    d.line([40, 20, 40, 62], fill=color, width=3)
    # 左右“文字”横线
    d.line([29, 30, 36, 30], fill=color, width=3)
    d.line([44, 30, 52, 30], fill=color, width=3)
    d.line([29, 40, 36, 40], fill=color, width=3)
    d.line([44, 40, 52, 40], fill=color, width=3)
    d.line([29, 50, 36, 50], fill=color, width=3)
    d.line([44, 50, 52, 50], fill=color, width=3)


def draw_doc(d: ImageDraw.ImageDraw, color: tuple) -> None:
    """订单：单据（圆角矩形 + 折角 + 三行内容线）"""
    d.rounded_rectangle([24, 18, 57, 63], radius=3, outline=color, width=4)
    # 左上折角
    d.line([46, 18, 46, 32], fill=color, width=4)
    d.line([46, 32, 34, 32], fill=color, width=4)
    # 内容线
    d.line([30, 42, 51, 42], fill=color, width=3)
    d.line([30, 51, 51, 51], fill=color, width=3)


def draw_bubble(d: ImageDraw.ImageDraw, color: tuple) -> None:
    """消息：聊天气泡 + 三点"""
    d.rounded_rectangle([20, 22, 61, 52], radius=8, outline=color, width=4)
    # 尾巴
    d.polygon([(44, 50), (52, 50), (48, 58)], fill=color)
    # 三点
    d.ellipse([30, 35, 34, 39], fill=color)
    d.ellipse([38, 35, 42, 39], fill=color)
    d.ellipse([46, 35, 50, 39], fill=color)


def draw_person(d: ImageDraw.ImageDraw, color: tuple) -> None:
    """我的：人形（头 + 肩）"""
    # 头
    d.ellipse([32, 20, 49, 37], outline=color, width=4)
    # 肩（拱形）
    d.arc([24, 40, 57, 66], start=180, end=360, fill=color, width=4)


ICONS = {
    "menu": draw_book,
    "orders": draw_doc,
    "messages": draw_bubble,
    "profile": draw_person,
}


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in ICONS.items():
        for suffix, color in (("", INACTIVE), ("-active", ACTIVE)):
            img = new_canvas()
            draw = ImageDraw.Draw(img)
            fn(draw, color)
            path = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            img.save(path, "PNG")
            print("written", os.path.relpath(path, os.path.join(OUT_DIR, "..", "..")), img.size)


if __name__ == "__main__":
    main()
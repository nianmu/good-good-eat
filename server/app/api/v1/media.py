"""媒体代理（M 系列）：Gitee raw 防盗链代理。

背景：HowToCook 导入菜的 image_url 指向 https://gitee.com/Anduin2017/HowToCook/raw/master/...，
但 Gitee raw 按 Referer 防盗链——网站内 <img> 携带本站 Referer 的请求会被重定向到
favicon（403），只有无 Referer（浏览器地址栏直开）才正常。本接口在服务端回源
（服务端请求不带 Referer → 拿到 200），前端把 gitee 直链换成
`/api/v1/media/htc/dishes/...` 即可正常展示（自带浏览器缓存头，同一图只回源一次）。

安全：仅放行 HowToCook 仓库 dishes 目录内的相对路径，杜绝 SSRF/任意回源。
"""

from __future__ import annotations

from pathlib import PurePosixPath
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Response

router = APIRouter()

RAW_BASE = "https://gitee.com/Anduin2017/HowToCook/raw/master"

_CT_HINTS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

# 浏览器缓存一周（图片基本不变；跟上游变化时同一 URL 内容已不可变）
_CACHE_HEADERS = {"Cache-Control": "public, max-age=604800"}


def _translate_media_uri(url: str | None) -> str | None:
    """逆转换：把 gitee raw 完整 URL 换成本代理的相对路径（供序列化层统一处理）。

    例：https://gitee.com/Anduin2017/HowToCook/raw/master/dishes/aquatic/油焖大虾/虾.jpg
        → /api/v1/media/htc/dishes/aquatic/油焖大虾/虾.jpg
    非 gitee 外链原样返回（保留既有外链方案）。
    """
    if not url or not url.startswith(RAW_BASE):
        return url
    rel = url[len(RAW_BASE) :].lstrip("/")
    if not rel.startswith("dishes/"):
        return url
    return f"/api/v1/media/htc/{rel}"


@router.get("/media/htc/{path:path}")
async def htc_media(path: str) -> Response:
    """代理 HowToCook 仓库图片：dishes/ 内相对路径 → gitee raw 回源。

    安全校验：路径必须位于 dishes/ 下、无 .. 穿越、至少两层。
    """
    norm = PurePosixPath(path)
    if len(norm.parts) < 2 or norm.parts[0] != "dishes" or ".." in norm.parts:
        raise HTTPException(status_code=404, detail="图片不存在")
    url = f"{RAW_BASE}/{quote(path, safe='/')}"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="图片源不可达") from exc
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail="图片不存在")

    content_type = _CT_HINTS.get(norm.suffix.lower(), "application/octet-stream")
    return Response(content=resp.content, media_type=content_type, headers=_CACHE_HEADERS)
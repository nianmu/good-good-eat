"""统一业务异常：ApiError。

错误码段约定：
- 400xx 参数/业务错误（如 40001 微信未配置、40002 已有固定厨师、40003 非法流转、40004 已被认领）
- 401xx 鉴权（40101 未登录/登录过期）
- 403xx 越权（40301 非团队成员）
- 404xx 不存在（40401）
- 501xx 外部依赖失败（50101 微信服务）
- 50000 兜底
"""

from __future__ import annotations


class ApiError(Exception):
    """携带 HTTP 状态码与业务错误码的异常，由全局异常处理器渲染统一信封。"""

    def __init__(self, status_code: int = 500, code: int = 50000, message: str = "服务器内部错误") -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")
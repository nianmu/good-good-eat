"""好好吃饭 · 后端服务配置。

环境变量以 .env 为准（不入库），详见 .env.example。
安全约定：
- DEBUG 默认关闭（生产必须显式 false，避免 SQL echo 泄露与调试页暴露）
- 生产模式（DEBUG=false）下禁止使用默认 JWT_SECRET / 弱密钥，启动即失败
"""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "dev-secret-change-me-please-use-a-longer-random-secret-32b-plus"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "好好吃饭 · 后端服务"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # 数据库：本机 MySQL8 端口 3307（User: root）
    database_url: str = "mysql+pymysql://root:123456@127.0.0.1:3307/good_good_eat?charset=utf8mb4"
    test_database_url: str = "mysql+pymysql://root:123456@127.0.0.1:3307/good_good_eat_test?charset=utf8mb4"

    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    wx_appid: str = ""
    wx_secret: str = ""

    cors_origins: str = "*"

    @model_validator(mode="after")
    def _check_prod_secrets(self) -> "Settings":
        if not self.debug:
            if self.jwt_secret == _DEFAULT_JWT_SECRET:
                raise ValueError(
                    "生产模式（DEBUG=false）禁止使用默认 JWT_SECRET，"
                    "请在 .env 中配置至少 32 位的随机密钥"
                )
            if len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET 长度不足 32 位，请更换更强的随机密钥")
        return self


@lru_cache
def get_settings() -> "Settings":
    return Settings()
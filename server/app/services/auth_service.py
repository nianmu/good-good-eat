"""统一认证服务（账号与身份解耦）。

- accounts（users）是跨端统一账号；user_identities 承载各渠道绑定。
- provider 约定：password(用户名+密码) / wechat(微信openid) / guest(游客昵称)
- 核心行为：登录即自动注册并绑定；游客账号绑定任一正式渠道即自动升级(is_guest=0)。
  （游客升级为静默自动，无需用户确认；若该渠道身份已被其他账号绑定则拒绝，不做静默合并。）
"""

from __future__ import annotations

import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models.user import User, UserIdentity

PROVIDER_PASSWORD = "password"
PROVIDER_WECHAT = "wechat"
PROVIDER_GUEST = "guest"

_PBKDF2_ITERATIONS = 200_000


def _random_digits(n: int = 8) -> str:
    return f"{secrets.randbelow(10 ** n):0{n}d}"


def _unique_user_code(db: Session) -> str:
    for _ in range(10):
        code = _random_digits(8)
        if db.scalar(select(User.id).where(User.user_code == code)) is None:
            return code
    raise ApiError(500, 50000, "用户标识码生成失败，请重试")


# ===== 密码哈希（stdlib PBKDF2，无额外依赖）=====
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), _PBKDF2_ITERATIONS)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


def create_user(db: Session, *, nickname: str | None = None, avatar: str = "👤", is_guest: bool = False) -> User:
    """创建用户（不提交，由调用流程统一提交）。"""
    name = (nickname or "").strip() or f"用户{_random_digits()}"
    user = User(nickname=name, avatar=avatar, user_code=_unique_user_code(db), is_guest=is_guest)
    db.add(user)
    db.flush()
    return user


def find_identity(db: Session, provider: str, provider_uid: str) -> UserIdentity | None:
    return db.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == provider, UserIdentity.provider_uid == provider_uid
        ).limit(1)
    )


def _bind_identity(
    db: Session, user: User, *, provider: str, provider_uid: str,
    credential: str | None = None, extra: str | None = None,
) -> None:
    """把身份绑定到目标用户；该身份已被其他账号占用则拒绝。"""
    existing = find_identity(db, provider, provider_uid)
    if existing is not None:
        if existing.user_id != user.id:
            raise ApiError(400, 40006, "该身份已绑定其他账号")
        return
    db.add(UserIdentity(user_id=user.id, provider=provider, provider_uid=provider_uid,
                        credential=credential, extra_json=extra))


def _commit(db: Session, user: User) -> User:
    db.commit()
    db.refresh(user)
    return user


def _bind_and_upgrade(db: Session, user: User) -> User:
    """绑定后，若该账号仍为游客则自动静默升级为正式账号。"""
    if user.is_guest:
        user.is_guest = False
    return _commit(db, user)


# ===== 游客登录 =====
def login_guest(db: Session, nickname: str | None = None) -> User:
    """游客登录：有昵称则同名游客复用；无昵称每次新建（保持原语义）。"""
    name = (nickname or "").strip()
    reuse = bool(name)
    ident_key = name or f"用户{_random_digits()}"

    if reuse:
        ident = find_identity(db, PROVIDER_GUEST, ident_key)
        if ident is not None:
            return ident.user

    user = create_user(db, nickname=ident_key, is_guest=True)
    _bind_identity(db, user, provider=PROVIDER_GUEST, provider_uid=ident_key)
    return _commit(db, user)


# ===== 微信登录 =====
def login_wechat(db: Session, openid: str, *, nickname: str | None = None,
                 current_user: User | None = None) -> User:
    """微信登录：已绑定→登录；未绑定且当前已登录→绑定并（游客）升级；否则自动注册绑定。"""
    ident = find_identity(db, PROVIDER_WECHAT, openid)
    if ident is not None:
        if current_user is not None and ident.user_id != current_user.id:
            raise ApiError(400, 40006, "该微信已绑定其他账号")
        return ident.user

    if current_user is not None:
        _bind_identity(db, current_user, provider=PROVIDER_WECHAT, provider_uid=openid)
        if nickname and current_user.is_guest:
            current_user.nickname = nickname
        return _bind_and_upgrade(db, current_user)

    user = create_user(db, nickname=nickname, avatar="👤", is_guest=False)
    _bind_identity(db, user, provider=PROVIDER_WECHAT, provider_uid=openid)
    return _commit(db, user)


# ===== 用户名+密码（H5/Web）=====
def register_password(db: Session, username: str, password: str, *,
                      nickname: str | None = None, current_user: User | None = None) -> User:
    """注册：用户名占用则拒绝；已登录则绑定并（游客）升级，否则自动注册新建。"""
    if find_identity(db, PROVIDER_PASSWORD, username) is not None:
        raise ApiError(400, 40020, "用户名已被注册")

    cred = hash_password(password)
    if current_user is not None:
        _bind_identity(db, current_user, provider=PROVIDER_PASSWORD, provider_uid=username, credential=cred)
        return _bind_and_upgrade(db, current_user)

    user = create_user(db, nickname=nickname or username, is_guest=False)
    _bind_identity(db, user, provider=PROVIDER_PASSWORD, provider_uid=username, credential=cred)
    return _commit(db, user)


def login_password(db: Session, username: str, password: str) -> User:
    """用户名+密码登录：身份不存在或密码不符统一报错（避免用户名枚举）。"""
    ident = find_identity(db, PROVIDER_PASSWORD, username)
    if ident is None or not ident.credential or not verify_password(password, ident.credential):
        raise ApiError(400, 40021, "用户名或密码错误")
    return ident.user
"""ORM 模型注册包：导入全部模型即注册到 Base.metadata（alembic 自动收集）。"""

from app.models.dish import Category, Dish
from app.models.message import Message
from app.models.order import Order, OrderItem
from app.models.user import Team, TeamMember, User

__all__ = [
    "Category",
    "Dish",
    "Message",
    "Order",
    "OrderItem",
    "Team",
    "TeamMember",
    "User",
]
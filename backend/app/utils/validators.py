import uuid
from typing import Optional

def parse_uuid(value: str | None) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None

from sqlalchemy.orm import Session
from sqlalchemy import text
import re

def apply_postgres_configuration(db: Session, config_data: dict) -> dict:
    best_config = config_data.get("best_configuration", {})
    
    if not best_config:
        raise ValueError("Invalid JSON format: 'best_configuration' key is missing")

    applied_keys = []
    errors = []

    key_pattern = re.compile(r"^[a-z0-9_]+$")

    for key, value in best_config.items():
        if not key_pattern.match(key):
            errors.append(f"Skipped invalid key format: {key}")
            continue

        try:
            if isinstance(value, str):
                query = text(f"ALTER SYSTEM SET {key} = '{value}'")
            else:
                query = text(f"ALTER SYSTEM SET {key} = {value}")
            
            db.execute(query)
            applied_keys.append(key)
        except Exception as e:
            errors.append(f"Failed to set {key}: {str(e)}")

    db.commit()

    try:
        db.execute(text("SELECT pg_reload_conf()"))
    except Exception as e:
        errors.append(f"Failed to reload config: {str(e)}")

    restart_query = text("SELECT name FROM pg_settings WHERE pending_restart = true")
    restart_rows = db.execute(restart_query).fetchall()
    restart_required_params = [row[0] for row in restart_rows]

    return {
        "status": "success" if not errors else "partial_success",
        "message": "Configuration applied successfully." if not errors else "Configuration applied with some errors.",
        "applied_count": len(applied_keys),
        "restart_required_params": restart_required_params,
        "errors": errors
    }
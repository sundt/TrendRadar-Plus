"""
Email Verification Code Service

Provides passwordless authentication via email verification codes.
Includes rate limiting to prevent abuse.
"""

import os
import random
import sqlite3
import time
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Configuration
CODE_LENGTH = 6
CODE_EXPIRY_SECONDS = 5 * 60  # 5 minutes
EMAIL_COOLDOWN_SECONDS = 60  # 1 minute between sends to same email
IP_HOURLY_LIMIT = 10  # Max sends per IP per hour
MAX_VERIFY_ATTEMPTS = 5  # Max wrong attempts before lockout
LOCKOUT_SECONDS = 15 * 60  # 15 minutes lockout


def _get_code_db_conn(project_root: str) -> sqlite3.Connection:
    """Get or create the verification code database connection."""
    db_path = os.path.join(project_root, "output", "email_codes.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS email_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            ip_address TEXT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER DEFAULT 0,
            verified INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_email_codes_ip ON email_codes(ip_address)")
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ip_rate_limits (
            ip_address TEXT PRIMARY KEY,
            send_count INTEGER DEFAULT 0,
            window_start INTEGER NOT NULL
        )
    """)
    conn.commit()
    return conn


def _generate_code() -> str:
    """Generate a random 6-digit code."""
    return "".join([str(random.randint(0, 9)) for _ in range(CODE_LENGTH)])


def _now_ts() -> int:
    return int(time.time())


def check_rate_limit(conn: sqlite3.Connection, email: str, ip_address: str) -> Tuple[bool, str]:
    """
    Check if sending is allowed based on rate limits.
    
    Returns:
        (allowed, error_message)
    """
    now = _now_ts()
    
    # Check email cooldown
    cur = conn.execute(
        "SELECT created_at FROM email_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
        (email.lower(),)
    )
    row = cur.fetchone()
    if row:
        last_sent = row[0]
        wait_seconds = EMAIL_COOLDOWN_SECONDS - (now - last_sent)
        if wait_seconds > 0:
            return False, f"请等待 {wait_seconds} 秒后再试"
    
    # Check IP hourly limit
    cur = conn.execute(
        "SELECT send_count, window_start FROM ip_rate_limits WHERE ip_address = ?",
        (ip_address,)
    )
    row = cur.fetchone()
    if row:
        send_count, window_start = row
        # Reset if window expired (1 hour)
        if now - window_start > 3600:
            conn.execute(
                "UPDATE ip_rate_limits SET send_count = 0, window_start = ? WHERE ip_address = ?",
                (now, ip_address)
            )
            conn.commit()
        elif send_count >= IP_HOURLY_LIMIT:
            return False, "发送次数过多，请稍后再试"
    
    return True, ""


def send_verification_code(
    project_root: str,
    email: str,
    ip_address: str = ""
) -> Tuple[bool, str]:
    """
    Generate and send a verification code to the email.
    
    Returns:
        (success, message)
    """
    email = email.lower().strip()
    if not email or "@" not in email:
        return False, "请输入有效的邮箱地址"
    
    conn = _get_code_db_conn(project_root)
    
    # Check rate limits
    allowed, error = check_rate_limit(conn, email, ip_address)
    if not allowed:
        return False, error
    
    # Generate code
    code = _generate_code()
    now = _now_ts()
    expires_at = now + CODE_EXPIRY_SECONDS
    
    # Save to database
    conn.execute(
        "INSERT INTO email_codes (email, code, ip_address, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (email, code, ip_address, now, expires_at)
    )
    
    # Update IP rate limit
    cur = conn.execute("SELECT 1 FROM ip_rate_limits WHERE ip_address = ?", (ip_address,))
    if cur.fetchone():
        conn.execute(
            "UPDATE ip_rate_limits SET send_count = send_count + 1 WHERE ip_address = ?",
            (ip_address,)
        )
    else:
        conn.execute(
            "INSERT INTO ip_rate_limits (ip_address, send_count, window_start) VALUES (?, 1, ?)",
            (ip_address, now)
        )
    
    conn.commit()
    
    # Send email
    try:
        from hotnews.kernel.services.email_service import send_email
        
        subject = f"HotNews 登录验证码：{code}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }}
                .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .logo {{ font-size: 24px; font-weight: bold; color: #3B82F6; margin-bottom: 20px; }}
                .code {{ font-size: 36px; font-weight: bold; color: #1E293B; letter-spacing: 8px; text-align: center; padding: 20px; background: #F1F5F9; border-radius: 8px; margin: 20px 0; }}
                .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🔥 HotNews</div>
                <h2>登录验证码</h2>
                <p>您的验证码是：</p>
                <div class="code">{code}</div>
                <p class="footer">
                    验证码 5 分钟内有效。<br>
                    如果您没有请求此验证码，请忽略此邮件。
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"您的 HotNews 登录验证码是：{code}\n\n验证码 5 分钟内有效。"
        
        success = send_email(email, subject, html_content, text_content)
        if success:
            logger.info(f"Verification code sent to {email}")
            return True, "验证码已发送"
        else:
            return False, "发送失败，请稍后重试"
            
    except Exception as e:
        logger.error(f"Failed to send verification code to {email}: {e}")
        return False, "发送失败，请稍后重试"


def verify_code(
    project_root: str,
    email: str,
    code: str
) -> Tuple[bool, str]:
    """
    Verify the code entered by user.
    
    Returns:
        (success, message)
    """
    email = email.lower().strip()
    code = code.strip()
    
    if not email or not code:
        return False, "请输入邮箱和验证码"
    
    conn = _get_code_db_conn(project_root)
    now = _now_ts()
    
    # Get the latest code for this email
    cur = conn.execute(
        """
        SELECT id, code, expires_at, attempts, verified 
        FROM email_codes 
        WHERE email = ? 
        ORDER BY created_at DESC 
        LIMIT 1
        """,
        (email,)
    )
    row = cur.fetchone()
    
    if not row:
        return False, "请先获取验证码"
    
    code_id, stored_code, expires_at, attempts, verified = row
    
    # Check if already verified
    if verified:
        return False, "验证码已使用，请重新获取"
    
    # Check if locked out
    if attempts >= MAX_VERIFY_ATTEMPTS:
        return False, "错误次数过多，请重新获取验证码"
    
    # Check expiry
    if now > expires_at:
        return False, "验证码已过期，请重新获取"
    
    # Check code
    if code != stored_code:
        conn.execute(
            "UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?",
            (code_id,)
        )
        conn.commit()
        remaining = MAX_VERIFY_ATTEMPTS - attempts - 1
        if remaining <= 0:
            return False, "错误次数过多，请重新获取验证码"
        return False, f"验证码错误，还剩 {remaining} 次机会"
    
    # Mark as verified
    conn.execute(
        "UPDATE email_codes SET verified = 1 WHERE id = ?",
        (code_id,)
    )
    conn.commit()
    
    return True, "验证成功"


def cleanup_expired_codes(project_root: str) -> int:
    """Clean up expired codes. Returns number of deleted rows."""
    conn = _get_code_db_conn(project_root)
    now = _now_ts()
    
    # Delete codes older than 1 hour
    cur = conn.execute(
        "DELETE FROM email_codes WHERE created_at < ?",
        (now - 3600,)
    )
    deleted = cur.rowcount
    
    # Reset old IP rate limits
    conn.execute(
        "DELETE FROM ip_rate_limits WHERE window_start < ?",
        (now - 3600,)
    )
    
    conn.commit()
    return deleted

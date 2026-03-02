"""
Email Service for sending transactional emails.

Supports:
- Password reset emails
- Welcome emails
- Notification emails
"""

import os
import ssl
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Email configuration from environment
EMAIL_SMTP_SERVER = os.environ.get("EMAIL_SMTP_SERVER", "smtpdm.aliyun.com")
EMAIL_SMTP_PORT = int(os.environ.get("EMAIL_SMTP_PORT", "465"))
EMAIL_FROM = os.environ.get("EMAIL_FROM", "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> bool:
    """
    Send an email using SMTP.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML body content
        text_content: Plain text body (optional, fallback)
        
    Returns:
        True if sent successfully, False otherwise
    """
    if not EMAIL_FROM or not EMAIL_PASSWORD:
        logger.warning("Email not configured (EMAIL_FROM or EMAIL_PASSWORD missing)")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = EMAIL_FROM
        msg["To"] = to_email
        
        # Add text part (fallback)
        if text_content:
            part1 = MIMEText(text_content, "plain", "utf-8")
            msg.attach(part1)
        
        # Add HTML part
        part2 = MIMEText(html_content, "html", "utf-8")
        msg.attach(part2)
        
        # Send via SMTP with SSL (timeout=10 to avoid indefinite blocking)
        context = ssl.create_default_context()

        with smtplib.SMTP_SSL(EMAIL_SMTP_SERVER, EMAIL_SMTP_PORT, context=context, timeout=10) as server:
            server.login(EMAIL_FROM, EMAIL_PASSWORD)
            server.sendmail(EMAIL_FROM, to_email, msg.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_password_reset_email(to_email: str, reset_token: str, base_url: str = "") -> bool:
    """
    Send password reset email.
    
    Args:
        to_email: User's email address
        reset_token: Password reset token
        base_url: Base URL for reset link (e.g., https://hot.uihash.com)
    """
    if not base_url:
        base_url = os.environ.get("HOTNEWS_BASE_URL", "https://hot.uihash.com")
    
    reset_link = f"{base_url}/api/auth/reset-password-page?token={reset_token}"
    
    subject = "重置您的 HotNews 密码"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .logo {{ font-size: 24px; font-weight: bold; color: #3B82F6; margin-bottom: 20px; }}
            .btn {{ display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }}
            .btn:hover {{ background: #2563EB; }}
            .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔥 HotNews</div>
            <h2>重置密码</h2>
            <p>您收到此邮件是因为有人请求重置您的 HotNews 账户密码。</p>
            <p>点击下面的按钮重置密码：</p>
            <p style="margin: 30px 0;">
                <a href="{reset_link}" class="btn">重置密码</a>
            </p>
            <p>或者复制以下链接到浏览器：</p>
            <p style="word-break: break-all; color: #666; font-size: 12px;">{reset_link}</p>
            <p class="footer">
                此链接将在 1 小时后失效。<br>
                如果您没有请求重置密码，请忽略此邮件。
            </p>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    HotNews 密码重置
    
    您收到此邮件是因为有人请求重置您的 HotNews 账户密码。
    
    点击以下链接重置密码：
    {reset_link}
    
    此链接将在 1 小时后失效。
    如果您没有请求重置密码，请忽略此邮件。
    """
    
    return send_email(to_email, subject, html_content, text_content)


def send_welcome_email(to_email: str, nickname: str = "") -> bool:
    """
    Send welcome email to new users.
    """
    base_url = os.environ.get("HOTNEWS_BASE_URL", "https://hot.uihash.com")
    
    subject = "欢迎加入 HotNews！"
    
    greeting = f"Hi {nickname}，" if nickname else "Hi，"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .logo {{ font-size: 24px; font-weight: bold; color: #3B82F6; margin-bottom: 20px; }}
            .btn {{ display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔥 HotNews</div>
            <h2>欢迎加入！</h2>
            <p>{greeting}</p>
            <p>感谢您注册 HotNews！现在您可以：</p>
            <ul>
                <li>订阅感兴趣的 RSS 源</li>
                <li>设置个性化标签偏好</li>
                <li>获取每日热点资讯</li>
            </ul>
            <p style="margin: 30px 0;">
                <a href="{base_url}" class="btn">开始探索</a>
            </p>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, subject, html_content)

import sqlite3

conn = sqlite3.connect("/app/output/user.db")
cursor = conn.cursor()

query = """
SELECT 
    u.id,
    u.email,
    u.nickname,
    u.created_at,
    am.auth_type,
    am.created_at as auth_created_at
FROM users u
JOIN user_auth_methods am ON u.id = am.user_id
WHERE am.auth_type IN ('github', 'google')
ORDER BY am.created_at DESC
"""

print("OAuth Users:")
print("=" * 80)
for row in cursor.execute(query):
    user_id, email, nickname, created_at, auth_type, auth_created = row
    print("User ID:", user_id)
    print("Email:", email or "N/A")
    print("Nickname:", nickname or "N/A")
    print("Auth Type:", auth_type)
    print("User Created:", created_at)
    print("OAuth Linked:", auth_created)
    print("-" * 80)

conn.close()

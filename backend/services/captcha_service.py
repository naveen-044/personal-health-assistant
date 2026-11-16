import random
import secrets
import time
from urllib.parse import quote

# Exclude ambiguous characters like 0, O, 1, I, l
CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

# Thread-safe in-memory cache for captcha codes: {captcha_id: {"code": str, "expires_at": float}}
_CAPTCHA_STORE = {}
# Used reset tokens: set of jti / tokens that have been consumed
_CONSUMED_RESET_TOKENS = set()


def _cleanup_expired():
    now = time.time()
    expired_keys = [k for k, v in _CAPTCHA_STORE.items() if v['expires_at'] < now]
    for k in expired_keys:
        _CAPTCHA_STORE.pop(k, None)


def generate_captcha(length: int = 5) -> dict:
    _cleanup_expired()
    captcha_id = secrets.token_urlsafe(24)
    code = ''.join(random.choices(CAPTCHA_CHARS, k=length))
    # Store uppercase code, valid for 5 minutes
    _CAPTCHA_STORE[captcha_id] = {
        'code': code.upper(),
        'expires_at': time.time() + 300,
    }

    # Generate visual SVG with anti-bot noise and distortion
    width = 160
    height = 50
    colors = ['#0f766e', '#0369a1', '#15803d', '#334155', '#4338ca', '#b45309']
    
    # Noise circles
    dots = []
    for _ in range(25):
        cx = random.randint(5, width - 5)
        cy = random.randint(5, height - 5)
        r = random.randint(1, 3)
        fill = random.choice(colors)
        dots.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" opacity="0.25"/>')

    # Noise wavy lines
    lines = []
    for _ in range(4):
        x1 = random.randint(5, 30)
        y1 = random.randint(10, 40)
        cx1 = random.randint(40, 80)
        cy1 = random.randint(5, 45)
        cx2 = random.randint(90, 130)
        cy2 = random.randint(5, 45)
        x2 = random.randint(130, 155)
        y2 = random.randint(10, 40)
        stroke = random.choice(colors)
        stroke_width = random.choice([1.2, 1.8, 2.0])
        lines.append(
            f'<path d="M {x1} {y1} C {cx1} {cy1}, {cx2} {cy2}, {x2} {y2}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}" fill="none" opacity="0.35"/>'
        )

    # Render characters with random rotation, color, and vertical offset
    chars_svg = []
    start_x = 22
    step_x = 24
    for i, char in enumerate(code):
        x = start_x + (i * step_x) + random.randint(-2, 2)
        y = 33 + random.randint(-3, 3)
        angle = random.randint(-22, 22)
        color = random.choice(colors)
        font_size = random.randint(24, 28)
        chars_svg.append(
            f'<text x="{x}" y="{y}" font-family="monospace, monospace" font-size="{font_size}" '
            f'font-weight="bold" fill="{color}" '
            f'transform="rotate({angle}, {x}, {y})">{char}</text>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'style="background-color:#f8fafc;border-radius:10px;border:1px solid #cbd5e1;user-select:none;">'
        f'{"".join(dots)}'
        f'{"".join(lines)}'
        f'{"".join(chars_svg)}'
        f'</svg>'
    )

    data_url = f'data:image/svg+xml;utf8,{quote(svg)}'
    return {
        'captcha_id': captcha_id,
        'captcha_image': data_url,
    }


def verify_captcha(captcha_id: str, user_input: str) -> bool:
    _cleanup_expired()
    item = _CAPTCHA_STORE.pop(captcha_id, None)
    if not item:
        return False
    if item['expires_at'] < time.time():
        return False
    # Case-insensitive comparison
    return item['code'] == user_input.strip().upper()


def mark_reset_token_consumed(token: str):
    _CONSUMED_RESET_TOKENS.add(token)


def is_reset_token_consumed(token: str) -> bool:
    return token in _CONSUMED_RESET_TOKENS

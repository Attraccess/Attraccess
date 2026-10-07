import re
from pathlib import Path


COLOR_VARIANT_MAP = {
    ("primary", "solid"): "primary",
    ("primary", "shadow"): "primary",
    ("primary", "faded"): "primary",
    ("primary", None): "primary",
    ("primary", "flat"): "secondary",
    ("primary", "light"): "ghost",
    ("primary", "ghost"): "ghost",
    ("primary", "bordered"): "outline",
    ("default", "solid"): "primary",
    ("default", "shadow"): "primary",
    ("default", "faded"): "primary",
    ("default", None): "primary",
    ("default", "flat"): "secondary",
    ("default", "light"): "ghost",
    ("default", "ghost"): "ghost",
    ("default", "bordered"): "outline",
    (None, "solid"): "primary",
    (None, None): None,
    (None, "flat"): "secondary",
    (None, "light"): "ghost",
    (None, "ghost"): "ghost",
    (None, "faded"): "ghost",
    (None, "bordered"): "outline",
    ("secondary", None): "secondary",
    ("secondary", "solid"): "secondary",
    ("secondary", "flat"): "secondary",
    ("secondary", "light"): "secondary",
    ("secondary", "ghost"): "secondary",
    ("secondary", "bordered"): "secondary",
    ("secondary", "faded"): "secondary",
    ("secondary", "shadow"): "secondary",
    ("danger", "solid"): "danger",
    ("danger", "shadow"): "danger",
    ("danger", None): "danger",
    ("danger", "flat"): "danger-soft",
    ("danger", "light"): "danger-soft",
    ("danger", "ghost"): "danger-soft",
    ("danger", "faded"): "danger-soft",
    ("danger", "bordered"): "outline",
    ("warning", None): "tertiary",
    ("warning", "solid"): "tertiary",
    ("warning", "flat"): "tertiary",
    ("warning", "light"): "tertiary",
    ("warning", "ghost"): "tertiary",
    ("warning", "bordered"): "tertiary",
    ("warning", "faded"): "tertiary",
    ("warning", "shadow"): "tertiary",
    ("success", None): "tertiary",
    ("success", "solid"): "tertiary",
    ("success", "flat"): "tertiary",
    ("success", "light"): "tertiary",
    ("success", "ghost"): "tertiary",
    ("success", "bordered"): "tertiary",
    ("success", "faded"): "tertiary",
    ("success", "shadow"): "tertiary",
}

OLD_VARIANTS = {"solid", "flat", "light", "bordered", "shadow", "faded", "ghost"}

KNOWN_COLORS = {"primary", "default", "secondary", "danger", "warning", "success"}

ISLOADING_RE = re.compile(r'\bisLoading=')

def scan_button_tags(text):
    """Yield (start, end, attrs_str, close) for each <Button ...> opening tag."""
    search_re = re.compile(r'<Button\b')
    i = 0
    while True:
        m = search_re.search(text, i)
        if not m:
            break
        start = m.start()
        name_end = m.end()
        pos = name_end
        depth = 0
        in_dq = in_sq = False
        while pos < len(text):
            ch = text[pos]
            if in_dq:
                if ch == '\\':
                    pos += 1
                elif ch == '"':
                    in_dq = False
            elif in_sq:
                if ch == '\\':
                    pos += 1
                elif ch == "'":
                    in_sq = False
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            elif ch == '"':
                in_dq = True
            elif ch == "'":
                in_sq = True
            elif ch == '>' and depth == 0:
                end = pos + 1
                close = '/>' if text[pos - 1] == '/' else '>'
                attrs_start = name_end
                attrs_end = pos - (1 if close == '/>' else 0)
                attrs_str = text[attrs_start:attrs_end]
                yield start, end, attrs_str, close
                break
            pos += 1
        i = start + 1

def extract_static(attrs_str, attr_name):
    m = re.search(r'(?<!\w)' + attr_name + r'=["\']([^"\']*)["\']', attrs_str)
    return m.group(1) if m else None

def has_dynamic(attrs_str, attr_name):
    return bool(re.search(r'(?<!\w)' + attr_name + r'=\{', attrs_str))

def strip_static_attr(attrs_str, attr_name):
    return re.sub(r'\s+' + attr_name + r'=["\'][^"\']*["\']', '', attrs_str)

def get_line_number(text, pos):
    return text[:pos].count('\n') + 1

import re
from pathlib import Path


def scan_alert_tags(text):
    search_re = re.compile(r'<Alert\b')
    i = 0
    while True:
        m = search_re.search(text, i)
        if not m:
            break
        start = m.start()
        pos = m.end()
        depth_brace = 0
        depth_tag = 1
        in_dq = in_sq = False
        attrs_end = pos
        self_close = False
        tag_end = pos

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
                depth_brace += 1
            elif ch == '}':
                depth_brace -= 1
            elif depth_brace == 0:
                if ch == '"':
                    in_dq = True
                elif ch == "'":
                    in_sq = True
                elif ch == '>' :
                    if pos > 0 and text[pos - 1] == '/':
                        self_close = True
                        attrs_end = pos - 1
                    else:
                        self_close = False
                        attrs_end = pos
                    tag_end = pos + 1
                    break
            pos += 1

        attrs_str = text[m.end():attrs_end]

        if self_close:
            yield start, tag_end, attrs_str, True, ""
            i = tag_end
            continue

        body_start = tag_end
        close_pos = find_close_tag(text, body_start)
        if close_pos is None:
            i = start + 1
            continue
        body = text[body_start:close_pos[0]]
        yield start, close_pos[1], attrs_str, False, body
        i = close_pos[1]

def find_close_tag(text, pos):
    depth = 1
    i = pos
    tag_re = re.compile(r'<(/?)Alert\b')
    while i < len(text):
        m = tag_re.search(text, i)
        if not m:
            return None
        if m.group(1) == '/':
            depth -= 1
            if depth == 0:
                close_end = text.index('>', m.end()) + 1
                return m.start(), close_end
        else:
            depth += 1
        i = m.end()
    return None

def extract_attr_value(attrs_str, attr_name):
    dq_re = re.compile(r'(?<!\w)' + re.escape(attr_name) + r'="([^"]*)"')
    sq_re = re.compile(r"(?<!\w)" + re.escape(attr_name) + r"='([^']*)'")
    m = dq_re.search(attrs_str) or sq_re.search(attrs_str)
    if m:
        return ('string', m.group(1))
    jsx_re = re.compile(r'(?<!\w)' + re.escape(attr_name) + r'=(\{)')
    m = jsx_re.search(attrs_str)
    if not m:
        return None
    brace_start = m.start(1)
    pos = brace_start + 1
    depth = 1
    in_dq = in_sq = False
    while pos < len(attrs_str):
        ch = attrs_str[pos]
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
            if depth == 0:
                return ('jsx', attrs_str[brace_start:pos + 1])
        elif ch == '"':
            in_dq = True
        elif ch == "'":
            in_sq = True
        pos += 1
    return None

def remove_attr(attrs_str, attr_name):
    dq_re = re.compile(r'\s+' + re.escape(attr_name) + r'="[^"]*"')
    sq_re = re.compile(r"\s+" + re.escape(attr_name) + r"='[^']*'")
    result = dq_re.sub('', attrs_str)
    result = sq_re.sub('', result)
    jsx_re = re.compile(r'\s+' + re.escape(attr_name) + r'=\{')
    m = jsx_re.search(result)
    if not m:
        return result
    brace_start = m.end() - 1
    pos = brace_start + 1
    depth = 1
    in_dq = in_sq = False
    while pos < len(result):
        ch = result[pos]
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
            if depth == 0:
                return result[:m.start()] + result[pos + 1:]
        elif ch == '"':
            in_dq = True
        elif ch == "'":
            in_sq = True
        pos += 1
    return result

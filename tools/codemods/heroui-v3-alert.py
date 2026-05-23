#!/usr/bin/env python3
# Codemod migrating HeroUI v2 Alert props to v3 compound AlertContent/Title/Description
# FEATURE: HeroUI v3 migration tooling for Alert component refactor

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
SEARCH_DIRS = [
    ROOT / "apps" / "frontend" / "src",
    ROOT / "libs",
]
EXCLUDE_DIRS = {"node_modules", ".nx", "dist", "__pycache__"}

V2_ONLY_PROPS = {"variant", "icon"}


def find_tsx_files(dirs):
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.tsx"):
            if not any(ex in p.parts for ex in EXCLUDE_DIRS):
                yield p


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


def value_to_child(val):
    if val is None:
        return None
    kind, raw = val
    if kind == 'string':
        return raw
    return raw


def get_indent(text, pos):
    line_start = text.rfind('\n', 0, pos) + 1
    spaces = ''
    for ch in text[line_start:pos]:
        if ch in (' ', '\t'):
            spaces += ch
        else:
            break
    return spaces


def has_compound_children(body):
    return bool(re.search(r'<AlertContent\b|<AlertTitle\b|<AlertDescription\b', body))


def body_is_effectively_empty(body):
    return body.strip() == ''


def build_compound(attrs_str, self_close, body, indent):
    color_val = extract_attr_value(attrs_str, 'color')
    status_val = extract_attr_value(attrs_str, 'status')
    title_val = extract_attr_value(attrs_str, 'title')
    description_val = extract_attr_value(attrs_str, 'description')

    if color_val is None and status_val is None and title_val is None and description_val is None:
        return None

    new_attrs = attrs_str
    for prop in V2_ONLY_PROPS:
        new_attrs = remove_attr(new_attrs, prop)

    if color_val is not None:
        new_attrs = remove_attr(new_attrs, 'color')
        kind, raw = color_val
        if kind == 'string':
            new_attrs = f' status="{raw}"' + new_attrs
        else:
            new_attrs = f' status={raw}' + new_attrs

    new_attrs = remove_attr(new_attrs, 'title')
    new_attrs = remove_attr(new_attrs, 'description')

    child_indent = indent + '  '
    content_indent = indent + '  '

    content_children = ''
    if title_val is not None:
        title_child = value_to_child(title_val)
        content_children += f'\n{child_indent}  <AlertTitle>{title_child}</AlertTitle>'
    if description_val is not None:
        desc_child = value_to_child(description_val)
        content_children += f'\n{child_indent}  <AlertDescription>{desc_child}</AlertDescription>'

    if not self_close and not body_is_effectively_empty(body) and not has_compound_children(body):
        existing_children = body.rstrip()
        if content_children:
            new_body = (
                f'\n{content_indent}<AlertContent>'
                + content_children
                + f'\n{content_indent}</AlertContent>'
                + existing_children
                + f'\n{indent}'
            )
        else:
            new_body = (
                f'\n{content_indent}<AlertContent>'
                f'\n{child_indent}  <AlertDescription>{existing_children.strip()}</AlertDescription>'
                f'\n{content_indent}</AlertContent>'
                f'\n{indent}'
            )
        return f'<Alert{new_attrs}>' + new_body + '</Alert>'

    if content_children:
        alert_content = (
            f'\n{content_indent}<AlertContent>'
            + content_children
            + f'\n{content_indent}</AlertContent>'
            f'\n{indent}'
        )
        return f'<Alert{new_attrs}>' + alert_content + '</Alert>'

    return f'<Alert{new_attrs} />'


def process_file(path):
    original = path.read_text(encoding='utf-8')
    if '<Alert' not in original:
        return 0, 0

    tags = list(scan_alert_tags(original))
    if not tags:
        return 0, 0

    rewrites = 0
    skipped = 0
    result_parts = []
    prev_end = 0

    for start, end, attrs_str, self_close, body in tags:
        result_parts.append(original[prev_end:start])

        if not self_close and has_compound_children(body):
            result_parts.append(original[start:end])
            skipped += 1
            prev_end = end
            continue

        color_val = extract_attr_value(attrs_str, 'color')
        status_val = extract_attr_value(attrs_str, 'status')
        title_val = extract_attr_value(attrs_str, 'title')
        description_val = extract_attr_value(attrs_str, 'description')

        needs_rewrite = (
            color_val is not None
            or title_val is not None
            or description_val is not None
        )
        if not needs_rewrite:
            result_parts.append(original[start:end])
            prev_end = end
            continue

        indent = get_indent(original, start)
        rebuilt = build_compound(attrs_str, self_close, body, indent)
        if rebuilt is None:
            result_parts.append(original[start:end])
            prev_end = end
            continue

        result_parts.append(rebuilt)
        rewrites += 1
        prev_end = end

    result_parts.append(original[prev_end:])
    new_content = ''.join(result_parts)

    if new_content != original:
        path.write_text(new_content, encoding='utf-8')

    return rewrites, skipped


def main():
    total_rewrites = 0
    total_skipped = 0
    total_files = 0

    tsx_files = list(find_tsx_files(SEARCH_DIRS))
    print(f'Scanning {len(tsx_files)} TSX files...')

    for path in tsx_files:
        try:
            text = path.read_text(encoding='utf-8')
        except Exception:
            continue
        if '<Alert' not in text:
            continue

        n_rewrites, n_skipped = process_file(path)
        total_skipped += n_skipped
        if n_rewrites > 0:
            total_files += 1
            total_rewrites += n_rewrites
            rel = path.relative_to(ROOT)
            print(f'  CHANGED ({n_rewrites}): {rel}')

    print(f'\nSummary:')
    print(f'  Files changed:   {total_files}')
    print(f'  Alerts rewritten: {total_rewrites}')
    print(f'  Alerts skipped (already compound): {total_skipped}')


if __name__ == '__main__':
    main()

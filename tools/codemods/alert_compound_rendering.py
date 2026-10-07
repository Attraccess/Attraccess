import re
from pathlib import Path
from alert_tag_parsing import extract_attr_value, remove_attr

V2_ONLY_PROPS = {"variant", "icon"}

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

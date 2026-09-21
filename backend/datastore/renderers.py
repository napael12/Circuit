"""Renderer interface (specs/datasource_enhancements.md): turns the raw
content a REST/S3/File datasource retrieves into rows/columns (a list of
plain dicts -- the same shape datastore.engine.execute_query already
returns for SQL, and what the frontend data grid controls already consume).

Each renderer_type maps to a function below taking (raw, config) and
returning list[dict]. To add a new renderer: add a function and register it
in RENDERERS.
"""
from __future__ import annotations

import csv
import io
import json


def _as_text(raw) -> str:
    return raw.decode('utf-8') if isinstance(raw, (bytes, bytearray)) else raw


JSON_ORIENTS = ('records', 'index', 'columns', 'split', 'values')


def _rows_from_orient(node, orient: str, index_name: str) -> list[dict]:
    """Converts a pandas ``DataFrame.to_json(orient=...)`` structure into row dicts.

    records: [{col: v}, ...] (handled by the caller, as-is)
    index:   {idx: {col: v}}  -> one row per idx, idx stored under ``index_name``
    columns: {col: {idx: v}}  -> one row per idx, idx stored under ``index_name``
    split:   {"index": [...], "columns": [...], "data": [[...]]}
    values:  [[v, ...], ...]  -> no labels; columns are named col1, col2, ...
    An empty ``index_name`` omits the index column.
    """
    def with_index(idx, cells: dict) -> dict:
        return {index_name: idx, **cells} if index_name else dict(cells)

    if orient == 'index':
        if not isinstance(node, dict):
            raise ValueError('orient=index expects a JSON object of {index: {column: value}}.')
        return [with_index(idx, cells if isinstance(cells, dict) else {'value': cells}) for idx, cells in node.items()]
    if orient == 'columns':
        if not isinstance(node, dict):
            raise ValueError('orient=columns expects a JSON object of {column: {index: value}}.')
        rows: dict = {}
        for col, cells in node.items():
            for idx, value in (cells if isinstance(cells, dict) else {}).items():
                rows.setdefault(idx, {})[col] = value
        return [with_index(idx, cells) for idx, cells in rows.items()]
    if orient == 'split':
        if not isinstance(node, dict) or 'data' not in node:
            raise ValueError('orient=split expects a JSON object with "columns", "data" and optionally "index".')
        columns = node.get('columns') or []
        index = node.get('index')
        out = []
        for i, values in enumerate(node['data']):
            cells = dict(zip(columns, values)) if columns else {f'col{j + 1}': v for j, v in enumerate(values)}
            out.append(with_index(index[i], cells) if index and i < len(index) else cells)
        return out
    if orient == 'values':
        if not isinstance(node, list):
            raise ValueError('orient=values expects a JSON array of arrays.')
        return [{f'col{j + 1}': v for j, v in enumerate(values)} for values in node]
    raise ValueError(f'Unknown JSON orient: {orient}')


def render_json(raw, config: dict) -> list[dict]:
    """JsonPath-based extraction: config = {"root_path"?, "orient"?, "index_name"?, "columns": [{"name", "path"}]}.

    ``root_path`` (default "$") selects the row nodes; when it resolves to a
    single JSON array, that array's elements are the rows. ``orient`` (as in
    pandas ``to_json``; default "records") says how the selected node is laid
    out -- records, index, columns, split or values -- and is first converted
    to row dicts (see _rows_from_orient); ``index_name`` (default "index")
    names the column holding the row labels for index/columns/split. Each
    column's ``path`` is a JsonPath evaluated relative to the row node --
    omit ``columns`` entirely to pass matched row objects through as-is.
    """
    from jsonpath_ng.ext import parse

    if isinstance(raw, (str, bytes, bytearray)) and not _as_text(raw).strip():
        # A ${param}-substituted body that resolves to nothing (e.g. no
        # selection made yet) is the normal "no data" case, not malformed
        # JSON -- same empty-list convention render_delimited already uses
        # for a blank input, rather than a raw JSON-parse 500.
        return []
    doc = json.loads(_as_text(raw)) if isinstance(raw, (str, bytes, bytearray)) else raw
    root_path = config.get('root_path') or '$'
    row_nodes = [match.value for match in parse(root_path).find(doc)]
    orient = config.get('orient') or 'records'
    if orient not in JSON_ORIENTS:
        raise ValueError(f'Unknown JSON orient: {orient}')
    if orient != 'records':
        if len(row_nodes) != 1:
            raise ValueError(f'orient={orient} needs root_path to select exactly one node (matched {len(row_nodes)}).')
        row_nodes = _rows_from_orient(row_nodes[0], orient, config.get('index_name', 'index'))
    elif len(row_nodes) == 1 and isinstance(row_nodes[0], list):
        row_nodes = row_nodes[0]

    columns = config.get('columns') or []
    if not columns:
        return [node for node in row_nodes if isinstance(node, dict)]

    rows = []
    for node in row_nodes:
        row = {}
        for col in columns:
            name = col['name']
            matches = parse(col.get('path') or name).find(node)
            row[name] = matches[0].value if matches else None
        rows.append(row)
    return rows


def render_xml(raw, config: dict) -> list[dict]:
    """XPath-based extraction: config = {"root_path", "columns": [{"name", "path"}]}.

    ``root_path`` selects the row elements; each column's ``path`` is an
    XPath expression evaluated relative to the row element (element text
    content, or an attribute/text() result).
    """
    from lxml import etree

    text = _as_text(raw)
    tree = etree.fromstring(text.encode('utf-8') if isinstance(text, str) else text)
    row_nodes = tree.xpath(config.get('root_path') or '//*')
    columns = config.get('columns') or []

    def extract(node, path):
        result = node.xpath(path)
        if isinstance(result, list):
            if not result:
                return None
            result = result[0]
        return result.text if hasattr(result, 'text') else str(result)

    return [
        {col['name']: extract(node, col.get('path') or col['name']) for col in columns}
        for node in row_nodes
    ]


def render_delimited(raw, config: dict) -> list[dict]:
    """config = {"delimiter": ",", "has_header": true, "quote_char"?: '"', "columns"?: [name, ...]}.

    ``columns`` supplies explicit column names -- required when
    has_header=false, optional (renames the header row) when true.
    ``quote_char`` (the "text qualifier") defaults to '"'; pass '' to disable
    quoting entirely (csv.QUOTE_NONE).
    """
    text = _as_text(raw)
    delimiter = config.get('delimiter') or ','
    has_header = config.get('has_header', True)
    explicit_columns = config.get('columns')
    quote_char = config.get('quote_char', '"')

    if quote_char:
        reader_kwargs = {'quotechar': quote_char}
    else:
        reader_kwargs = {'quoting': csv.QUOTE_NONE}
    data_rows = list(csv.reader(io.StringIO(text), delimiter=delimiter, **reader_kwargs))
    if not data_rows:
        return []
    if has_header:
        names = explicit_columns or data_rows[0]
        data_rows = data_rows[1:]
    else:
        names = explicit_columns or [f'col{i + 1}' for i in range(len(data_rows[0]))]

    return [dict(zip(names, row)) for row in data_rows]


def render_fixed_width(raw, config: dict) -> list[dict]:
    """config = {"fields": [{"name": "col1", "width": 10}, ...]} -- fields read left to right."""
    text = _as_text(raw)
    fields = config.get('fields') or []
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        row = {}
        pos = 0
        for field in fields:
            width = int(field['width'])
            row[field['name']] = line[pos:pos + width].strip()
            pos += width
        rows.append(row)
    return rows


RENDERERS = {
    'json': render_json,
    'xml': render_xml,
    'delimited': render_delimited,
    'fixed_width': render_fixed_width,
}


def render(renderer_type: str, raw, config: dict | None) -> list[dict]:
    fn = RENDERERS.get(renderer_type)
    if fn is None:
        raise ValueError(f'Unknown renderer type: {renderer_type}')
    return fn(raw, config or {})

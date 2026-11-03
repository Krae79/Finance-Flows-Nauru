"""Load the costing source mapping from the CSV files in ../data.
Edit the CSVs (not this file) to change sources, costs or decisions, then re-run build_workbook.py."""
import csv, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
def _rows(name):
    with open(os.path.join(D, name), newline='', encoding='utf-8') as f: return list(csv.DictReader(f))
R = [(r['sub_activity'], int(r['step']), r['doc_key'], r['reference'], r['item'], float(r['original_cost']) if '.' in r['original_cost'] else int(r['original_cost']),
      r['currency'], int(r['price_year']), r['scale_key'], r['cost_type'], r['note']) for r in _rows('source_mapping.csv')]
INCLUDED = {r['sub_activity']: r['covered_by_note'] for r in _rows('covered_elsewhere.csv')}
BLANK = {r['sub_activity']: r['reason'] for r in _rows('not_costed.csv')}
DOCS = {r['doc_key']: r['full_title'] for r in _rows('documents.csv')}
SHORT = {r['doc_key']: r['short_name'] for r in _rows('documents.csv')}
FLAGS = {r['sub_activity']: r['flag'] for r in _rows('cost_type_flags.csv')}
TT = {r['sub_activity']: r['transfer_type'] for r in _rows('transfer_types.csv')}

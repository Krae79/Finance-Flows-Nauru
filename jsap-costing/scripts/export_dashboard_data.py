"""Export the computed numbers from a built (recalculated) workbook to ../data/dashboard/*.json for the dashboard.
Usage: python export_dashboard_data.py --workbook ../workbook/JSAP_Costing_Workbook.xlsx"""
import argparse, json, os, sys, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import load_mapping as M
ap = argparse.ArgumentParser(); ap.add_argument('--workbook', required=True); a = ap.parse_args()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'dashboard'); os.makedirs(OUT, exist_ok=True)
wb = openpyxl.load_workbook(a.workbook, data_only=True)
ch = wb['Chuuk']; PK = {}
acts, subs = [], []
for r in range(4, ch.max_row + 1):
    p, a_, s = ch.cell(r, 1).value, ch.cell(r, 2).value, ch.cell(r, 5).value
    if not a_: continue
    v = lambda c: ch[f'{c}{r}'].value
    if s is None:
        acts.append({'package': a_.split('.')[0], 'package_name': p, 'activity': a_, 'name': v('C'), 'capex': v('G') or 0, 'opex': v('J') or 0,
                     'past_jsap': v('M') or 0, 'idp': v('N') or 0, 'other': v('O') or 0, 'justification': v('I')})
    else:
        status = 'not_costed' if s in M.BLANK else 'covered_elsewhere' if s in M.INCLUDED else 'costed'
        steps = sorted({t[1] for t in M.R if t[0] == s})
        subs.append({'activity': a_, 'sub_activity': s, 'name': v('F'), 'status': status, 'capex': v('H'), 'opex': v('K'),
                     'past_jsap': v('M') or 0, 'idp': v('N') or 0, 'other': v('O') or 0, 'first_step': steps[0] if steps else None,
                     'confidence': ('direct' if any(t[10].startswith('Direct') for t in M.R if t[0] == s) else 'analogue') if status == 'costed' else None,
                     'flag': M.FLAGS.get(s), 'justification': v('I')})
bs = wb['Cost basis']; lines = []
for r in range(34, bs.max_row + 1):
    if not bs.cell(r, 1).value or bs.cell(r, 13).value not in ('CAPEX', 'OPEX'): continue
    g = lambda c: bs.cell(r, c).value
    lines.append({'sub_activity': g(1), 'step': g(2), 'document': g(3), 'reference': g(4), 'item': g(5), 'original_cost': g(6), 'currency': g(7),
                  'price_year': g(8), 'escalation': g(9), 'fx': g(10), 'scale_basis': g(11), 'scale': g(12), 'cost_type': g(13), 'estimate_2026': g(14), 'note': g(15)})
sf = wb['State factors']; states = []
for r in range(12, sf.max_row + 1):
    code = sf.cell(r, 1).value
    if code is None or sf.cell(r, 1).value == 'NAP code': break
    states.append({'activity': code, 'name': sf.cell(r, 2).value, 'Chuuk': sf.cell(r, 3).value, 'Kosrae': sf.cell(r, 4).value, 'Pohnpei': sf.cell(r, 5).value,
                   'Yap': sf.cell(r, 6).value, 'FSM': sf.cell(r, 7).value, 'same': sf.cell(r, 8).value, 'population': sf.cell(r, 9).value,
                   'sites': sf.cell(r, 10).value, 'state_specific': sf.cell(r, 11).value})
uc = wb['Source check']; jsap = []
for r in range(4, 30):
    if uc.cell(r, 2).value in (None, 'Total'): break
    jsap.append({'objective': uc.cell(r, 1).value, 'name': uc.cell(r, 2).value, 'total_2016': uc.cell(r, 3).value, 'used_2016': uc.cell(r, 4).value})
# Unused JSAP 2016 lines with reasons, and unit costs reused across sub-activities (lower sections of Source check).
unused, reused, mode = [], [], None
for r in range(1, uc.max_row + 1):
    first = uc.cell(r, 1).value
    if isinstance(first, str) and first.startswith('Main Chuuk JSAP 2016 lines not used'): mode = 'unused'; continue
    if isinstance(first, str) and first.startswith('Unit costs from other States reused'): mode = 'reused'; continue
    if mode is None or first is None or first in ('JSAP 2016 line',): continue
    g = lambda c: uc.cell(r, c).value
    if mode == 'unused': unused.append({'line': g(1), 'item': g(2), 'cost_2016': g(3), 'reason': g(4), 'decision_needed': g(5)})
    else: reused.append({'source': g(1), 'item': g(2), 'unit_cost': g(3), 'used_for': g(4)})
for name, obj in (('activities', acts), ('sub_activities', subs), ('source_lines', lines), ('state_factors', states), ('jsap2016_use', jsap),
                  ('jsap2016_unused', unused), ('unit_cost_reuse', reused)):
    json.dump(obj, open(os.path.join(OUT, name + '.json'), 'w'), indent=1, default=str)
print('exported', {k: len(v) for k, v in (('activities', acts), ('sub_activities', subs), ('source_lines', lines), ('state_factors', states), ('jsap2016_use', jsap), ('jsap2016_unused', unused), ('unit_cost_reuse', reused))})

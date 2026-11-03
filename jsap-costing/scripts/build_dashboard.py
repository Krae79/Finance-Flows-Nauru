"""Build the self-contained dashboard: inline ../data/dashboard/*.json into ../dashboard/template.html.
Run after export_dashboard_data.py. Usage: python build_dashboard.py"""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
DD = os.path.join(H, '..', 'data', 'dashboard')
DASH = os.path.join(H, '..', 'dashboard')
names = ['activities', 'sub_activities', 'source_lines', 'state_factors', 'jsap2016_use', 'jsap2016_unused', 'unit_cost_reuse']
data = {n: json.load(open(os.path.join(DD, n + '.json'), encoding='utf-8')) for n in names}
tpl = open(os.path.join(DASH, 'template.html'), encoding='utf-8').read()
blob = json.dumps(data, separators=(',', ':')).replace('</', '<\\/')
out = tpl.replace('/*__DATA__*/null', blob)
assert out != tpl, 'data placeholder not found in template'
open(os.path.join(DASH, 'index.html'), 'w', encoding='utf-8').write(out)
capex = sum(a['capex'] for a in data['activities'])
fsm = sum(s['FSM'] or 0 for s in data['state_factors'])
print(f'dashboard written: Chuuk CAPEX {capex:,.0f}, FSM roll-up {fsm:,.0f}')

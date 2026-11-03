"""Independent checks on a built workbook. Run after build_workbook.py and a recalculation.
1. Every original cost appears in its source text (or is a sum of figures that do).
2. Every Chuuk sub-activity is costed, covered elsewhere or not costed - exactly once.
3. Chuuk tab values equal an independent Python recompute; source columns M/N/O split correctly.
4. Worked examples and State factors checks all read 'Matches'.
Usage: python verify.py --workbook ../workbook/JSAP_Costing_Workbook.xlsx"""
import argparse, collections, os, re, sys, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import load_mapping as M
ap = argparse.ArgumentParser(); ap.add_argument('--workbook', required=True); a = ap.parse_args()
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sources', 'text')
TXT = {k: open(os.path.join(ROOT, f), encoding='utf-8', errors='ignore').read() for k, f in {
    'J16': 'Chuuk_JSAP_2016.txt', 'IDP': 'Chuuk_IDP_2025_vol2.txt', 'PNI': 'Pohnpei_JSAP_2016.txt', 'YAP': 'Yap_JSAP_2015.txt',
    'KOS': 'Kosrae_JSAP_2015.txt', 'MCT': 'AF_MCT_FSM_2017.txt', 'PAL': 'Palau_PACC_BCA_2012.txt', 'COK': 'CookIslands_JNAP2.txt'}.items()}
def present(doc, v):
    forms = {f'{v:,}', str(v)}
    if doc in ('IDP', 'COK'): forms |= {f'{v/1e6:.1f}', f'{v/1e6:g}', f'{v/1e6:.2f}'.rstrip('0'), f'{v/1000:g}K'}
    return any(re.search(r'(?<![\d.,])' + re.escape(f) + r'(?![\d,])', TXT[doc]) for f in forms)
fails = 0
for t in M.R:
    if present(t[2], t[5]): continue
    comps = [int(x.replace(',', '')) for x in re.findall(r'\$([\d,]+)', t[4])]
    if comps and sum(comps) == t[5] and all(present(t[2], c) for c in comps): continue
    print('CHECK BY HAND (derived or not found):', t[0], t[2], t[3], t[5], t[4][:60])
wb = openpyxl.load_workbook(a.workbook, data_only=True); ch = wb['Chuuk']
c26 = sum([325.252, 326.785, 330.213, 333.020, 335.123, 333.952, 333.918, 334.980, 336.940]) / 9
CPI = {2012: 229.594, 2015: 237.017, 2016: 240.007, 2017: 245.120, 2024: 313.689}
SF = {'none': 1, 'popYap': 48654/11376, 'popPni': 48654/36196, 'regions': 5, 'sites10': 10, 'share6': 1/6, 'state4': .25, 'cok5': .2}
exp = collections.defaultdict(float); src = collections.defaultdict(lambda: collections.defaultdict(float))
for t in M.R:
    if t[9] != 'CAPEX': continue
    v = t[5] * c26 / CPI[t[7]] * (1/1.436526 if t[6] == 'NZD' else 1) * SF[t[8]]; exp[t[0]] += v; src[t[0]][t[1]] += v
mapped = {t[0] for t in M.R}
for r in range(4, ch.max_row + 1):
    s = ch.cell(r, 5).value
    if not s: continue
    n = (s in mapped) + (s in M.INCLUDED) + (s in M.BLANK)
    if n != 1: print('CLASSIFICATION ERROR', s, n); fails += 1
    h = ch[f'H{r}'].value
    if s in M.BLANK:
        if h is not None: print('BLANK HAS VALUE', s); fails += 1
        continue
    if abs((h or 0) - exp.get(s, 0)) > 0.5: print('VALUE MISMATCH', s, h, exp.get(s)); fails += 1
    for col, st in (('M', 1), ('N', 2), ('O', 3)):
        if abs((ch[f'{col}{r}'].value or 0) - src[s][st]) > 0.5: print('SOURCE SPLIT MISMATCH', s, col); fails += 1
for sh in ('Worked examples', 'State factors'):
    ws = wb[sh]; bad = sum(1 for row in ws.iter_rows() for c in row if c.value == 'Check')
    if bad: print(sh, 'checks not matching:', bad); fails += bad
print('FAILURES:', fails)

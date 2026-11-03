import sys, collections, copy, shutil, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
import argparse, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import load_mapping as M
ap = argparse.ArgumentParser(description='Rebuild the Chuuk costing tabs in the JSAP Costing Workbook from data/*.csv')
ap.add_argument('--input', required=True, help='Live JSAP_Costing_Workbook.xlsx (Chuuk, Kosrae, Yap, Pohnpei tabs)')
ap.add_argument('--output', required=True, help='Output workbook path')
args = ap.parse_args()
LIVE, OUT = args.input, args.output
wb = openpyxl.load_workbook(LIVE)
for n in ['Cost basis', 'Worked examples', 'State factors', 'Source check', 'Change log',
          'Cost basis Pkg 3-4', 'Worked examples Pkg 3-4', 'State factors Pkg 3-4', 'Change log Pkg 3-4']:
    if n in wb.sheetnames: del wb[n]
wb._external_links = []
for n in ['Sheet1']:
    if n in wb.sheetnames: del wb[n]
ch = wb['Chuuk']

GREY = PatternFill('solid', fgColor='FFD9D9D9')
F = lambda **k: Font(name='Calibri', size=k.pop('sz', 11), **k)
NAVY = 'FF002E4F'
MINT = PatternFill('solid', fgColor='FFBDDECC'); TAN = PatternFill('solid', fgColor='FFFAF2E3')
TINT = PatternFill('solid', fgColor='FFEFF7F3'); YEL = PatternFill('solid', fgColor='FFFFFF00')
NOFILL = PatternFill(fill_type=None)
thin = Side(style='thin', color='FFBCC8D1'); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
W = Alignment(wrap_text=True, vertical='top')
ACC = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@_-'
NUM = '#,##0;-#,##0;"-"'
BS = 'Cost basis'; Q = "'" + BS + "'"

def hdr(ws, row, heads, widths=None):
    for j, h in enumerate(heads, 1):
        c = ws.cell(row, j, h); c.font = F(bold=True, color=NAVY); c.fill = MINT; c.alignment = W; c.border = BOX
    if widths:
        for j, w in enumerate(widths, 1): ws.column_dimensions[CL(j)].width = w
def body(ws, r, n, fill=None, bold=False):
    for j in range(1, n + 1):
        c = ws.cell(r, j); c.font = F(bold=bold); c.alignment = W; c.border = BOX
        if fill: c.fill = fill

# ===================== Cost basis =====================
b = wb.create_sheet(BS)
b['A1'] = 'Cost basis: Chuuk JSAP costing, all six activity packages (USD 2026)'; b['A1'].font = F(sz=14, bold=True, color=NAVY)
b['A2'] = ('Method: Step 1 Chuuk JSAP 2016 Appendix D; Step 2 Chuuk IDP 2025-2034; Step 3 other FSM State JSAPs, other Pacific plans and projects. '
           'Each line: original cost x escalation to 2026 (US CPI-U) x FX to USD x scale to Chuuk = estimate. Blue cells are inputs. Prepared 3 Nov 2026 for team review.')
b['A2'].alignment = W; b['A2'].font = F(italic=True); b.merge_cells('A2:O2'); b.row_dimensions[2].height = 32
hdr(b, 4, ['Assumption', 'Value', 'Source / note'])
CPI_SRC = 'US BLS CPI-U (1982-84=100), via usinflationcalculator.com, accessed 2 Nov 2026'
months = [('Jan',325.252),('Feb',326.785),('Mar',330.213),('Apr',333.020),('May',335.123),('Jun',333.952),('Jul',333.918),('Aug',334.980),('Sep',336.940)]
A = [('CPI-U 2026 price base (average Jan-Sep 2026)', '=AVERAGE(B6:B14)', 'October 2026 CPI not yet released (due 10 Nov 2026).')]
A += [(f'CPI-U {m} 2026', v, CPI_SRC) for m, v in months]
A += [('CPI-U annual average 2012', 229.594, CPI_SRC), ('CPI-U annual average 2015', 237.017, CPI_SRC),
      ('CPI-U annual average 2016', 240.007, CPI_SRC), ('CPI-U annual average 2017', 245.120, CPI_SRC),
      ('CPI-U annual average 2024', 313.689, CPI_SRC + '. IDP price year (estimates prepared 2024).'),
      ('Population Chuuk (2010 Census)', 48654, 'Chuuk JSAP 2016, Section 1.2'),
      ('Population Pohnpei (2010 Census)', 36196, 'Pohnpei JSAP 2016, Section 1.2'),
      ('Population Yap (2010 Census)', 11376, 'Yap JSAP 2015, Section 1.2'),
      ('Chuuk regions', 5, 'Northern Namoneas, Southern Namoneas, Faichuk, Mortlocks, Northwest (Chuuk JSAP 2016, Section 1.1)'),
      ('Priority taro sites per region (3.4.2)', 2, 'Assumption for team review'),
      ('Sectors in Chuuk JSAP 2016', 6, 'Chuuk JSAP 2016, Table 10 (not currently used)'),
      ('FSM States', 4, 'Chuuk share of FSM-wide budget lines (4.7.4)'),
      ('Sub-actions in Cook Islands JNAP II Action 11', 5, 'Cook Islands JNAP II 2016-2020, Action 11 (a) to (e)'),
      ('NZD per USD, 2016 annual average', 1.436526, 'FRED series CCUSMA02NZA618N (OECD), 2016'),
      ('Annual OPEX, programmes (% of CAPEX)', 0.02, 'Team assumption: 2% annual O&M for programmes'),
      ('Annual OPEX, infrastructure (% of CAPEX)', 0.03, 'Team assumption: 1-5% for infrastructure; 3% used')]
for i, (lab, val, src) in enumerate(A, start=5):
    b[f'A{i}'], b[f'B{i}'], b[f'C{i}'] = lab, val, src
    b[f'B{i}'].font = F() if str(val).startswith('=') else F(color='FF0000FF')
    b[f'B{i}'].number_format = '0.0%' if isinstance(val, float) and val < 1 else ('#,##0.000' if isinstance(val, float) else '#,##0')
    for c in 'ABC': b[f'{c}{i}'].border = BOX; b[f'{c}{i}'].alignment = W
b['B5'].number_format = '#,##0.000'
CPIROW = {2012: 15, 2015: 16, 2016: 17, 2017: 18, 2024: 19}
SCALE = {'none': ('1', 'None'), 'popYap': ('=$B$20/$B$22', 'Population Chuuk / Yap'), 'popPni': ('=$B$20/$B$21', 'Population Chuuk / Pohnpei'),
         'regions': ('=$B$23', 'Number of Chuuk regions'), 'sites10': ('=$B$23*$B$24', 'Regions x priority sites per region'),
         'share6': ('=1/$B$25', '1 of 6 JSAP sectors'), 'state4': ('=1/$B$26', 'Chuuk share (1 of 4 States)'), 'cok5': ('=1/$B$27', 'One of five sub-actions')}
SFAC = {'none': 1, 'popYap': 48654/11376, 'popPni': 48654/36196, 'regions': 5, 'sites10': 10, 'share6': 1/6, 'state4': 0.25, 'cok5': 0.2}
HR = 33
hdr(b, HR, ['Sub-activity', 'Step', 'Source document', 'Reference', 'Reference item', 'Original cost', 'Currency', 'Price year',
            'Escalation to 2026 (CPI-U)', 'FX to USD', 'Scale basis', 'Scale factor', 'Cost type', 'Estimate (USD 2026)', 'Note'],
    [44, 15, 52, 11, 50, 13, 9, 9, 11, 9, 24, 9, 9, 15, 52])
STEP = {1: '1 Past JSAP', 2: '2 IDP', 3: '3 Other source'}
order = lambda t: [int(x) for x in t[0].split('.')]
RS = sorted(M.R, key=order)
for k, (sid, step, doc, ref, item, cost, cur, yr, sk, ct, note) in enumerate(RS):
    r = HR + 1 + k
    vals = [sid, STEP[step], M.DOCS[doc], ref, item, cost, cur, str(yr), f'=$B$5/$B${CPIROW[yr]}', 1 if cur == 'USD' else '=1/$B$28',
            SCALE[sk][1], 1 if sk == 'none' else SCALE[sk][0], ct, f'=F{r}*I{r}*J{r}*L{r}', note]
    for j, v in enumerate(vals, 1): b.cell(r, j, v)
    body(b, r, 15)
    b.cell(r, 6).font = F(color='FF0000FF'); b.cell(r, 6).number_format = '#,##0'
    for j in (9, 10, 12): b.cell(r, j).number_format = '0.000'
    b.cell(r, 14).number_format = '#,##0'
BL = HR + len(RS)
b.cell(BL + 2, 13, 'Total').font = F(bold=True)
b.cell(BL + 2, 14, f'=SUM(N{HR+1}:N{BL})').number_format = '#,##0'; b.cell(BL + 2, 14).font = F(bold=True)
b.freeze_panes = f'A{HR+1}'
RNG = lambda c: f'{Q}!${c}${HR+1}:${c}${BL}'

# python-side estimate (for checks and text)
c26 = sum(v for _, v in months) / 9
CPI = {2012: 229.594, 2015: 237.017, 2016: 240.007, 2017: 245.120, 2024: 313.689}
def est(t): return t[5] * c26 / CPI[t[7]] * (1 / 1.436526 if t[6] == 'NZD' else 1) * SFAC[t[8]]
by = collections.defaultdict(list)
for t in RS: by[t[0]].append(t)

# ===================== Chuuk tab =====================
log = []
acts = collections.OrderedDict(); subrow = {}
for r in range(4, ch.max_row + 1):
    a, s = ch.cell(r, 2).value, ch.cell(r, 5).value
    if not a: continue
    if s is None: acts[a] = [r, []]
    else: acts[a][1].append(r); subrow[s] = r
for a, (ar, subs) in acts.items():
    log.append((a, ar, {c: ch[f'{c}{ar}'].value for c in 'GIJL'}))
    for sr in subs:
        log.append((ch.cell(sr, 5).value, sr, {c: ch[f'{c}{sr}'].value for c in 'HIKL'}))
SNAME = {1: 'Past JSAP', 2: 'IDP', 3: 'Other source'}
cnt = collections.defaultdict(collections.Counter)
for s, r in subrow.items():
    act = '.'.join(s.split('.')[:2])
    for col in 'GHIJKLMNOPQR':
        c = ch[f'{col}{r}']; c.value = None; c.fill = GREY if col in 'GJ' else NOFILL
    if s in M.BLANK:
        ch[f'H{r}'].fill = YEL; ch[f'K{r}'].fill = YEL
        ch[f'I{r}'] = 'Not costed: ' + M.BLANK[s]
        cnt[act]['blank'] += 1
    elif s in M.INCLUDED:
        ch[f'H{r}'] = 0; ch[f'K{r}'] = 0
        ch[f'I{r}'] = 'No separate cost. ' + M.INCLUDED[s]; ch[f'L{r}'] = 'No separate cost.'
        cnt[act]['incl'] += 1
    else:
        refs = by[s]
        ch[f'H{r}'] = f'=SUMIFS({RNG("N")},{RNG("A")},E{r},{RNG("M")},"CAPEX")'
        q = M.FLAGS.get(s) == 'Q'
        ch[f'K{r}'] = f'=H{r}*{Q}!$B${30 if q else 29}+SUMIFS({RNG("N")},{RNG("A")},E{r},{RNG("M")},"OPEX")'
        parts = []
        for t in refs:
            cs = f'${t[5]:,.0f}' if t[6] == 'USD' else f'NZD {t[5]:,.0f}'
            sc = '' if t[8] == 'none' else f' x {SCALE[t[8]][1].lower().replace("chuuk", "Chuuk").replace("yap", "Yap").replace("pohnpei", "Pohnpei")}'
            parts.append(f'{SNAME[t[1]]}: {M.SHORT[t[2]]} {t[3]} "{t[4]}", {cs} ({t[7]}){sc} = ${est(t):,.0f} (2026).')
        notes = ' '.join(dict.fromkeys(t[10] for t in refs))
        ch[f'I{r}'] = ' '.join(parts) + ' Escalated to 2026 USD with US CPI-U. ' + notes
        ch[f'L{r}'] = ('3% of CAPEX per year (infrastructure).' if q else '2% of CAPEX per year (programme).') + \
                      (' Plus annual community monitoring (Pohnpei JSAP 2016 5.4.2).' if any(t[9] == 'OPEX' for t in refs) else '')
        for col, st in (('M', '1 Past JSAP'), ('N', '2 IDP'), ('O', '3 Other source')):
            if any(STEP[t[1]] == st for t in refs):
                ch[f'{col}{r}'] = f'=SUMIFS({RNG("N")},{RNG("A")},E{r},{RNG("B")},"{st}",{RNG("M")},"CAPEX")'
        cnt[act][min(t[1] for t in refs)] += 1
    fl = M.FLAGS.get(s)
    if fl: ch[f'{fl}{r}'] = 'Yes'
    for col in 'HIKLMNOPQR':
        c = ch[f'{col}{r}']; c.font = F(); c.alignment = W
    for col in 'HKMNO': ch[f'{col}{r}'].number_format = ACC
GREY = PatternFill('solid', fgColor='FFD9D9D9')
for s, r in subrow.items():
    for col in 'GJ': ch[f'{col}{r}'].fill = GREY
XC = {
 '1.2': 'Cross-check: IDP CE2 Typhoon-Proof Shelters $1.41m and MS1 Climate-Proofing Infrastructure $11.19m (2024) not added (similar scope to JSAP lines used).',
 '1.4': 'IDP MA4 used for 1.4.3. Related IDP AV1 Cargo Storage $2.0m and MA1 seaport not added.',
 '2.5': 'ADB W12 Chuuk Water Supply and Sanitation Project $35.7m (ongoing, funded) not added.',
 '2.7': 'Cross-check: IDP SW3 $1.65m, SW4 $1.65m, SW6 $3.5m (2024) waste facilities not added; pending S12 Recycling Facility $5.4m (SPREP).',
 '3.5': 'IDP AF2 $0.35m, MA3 $0.75m; pipeline F15 $12.8m and F11 $4.3m. Not added.',
 '3.6': 'Cross-check for 3.6.4: IDP AF1 + AF2 + MA3 = $2.55m (2024).',
 '4.3': 'IDP CE1 (4.3.6), CE3 and AF3 (4.3.7) included. CE5 and CE6 costed under 5.3.2.',
 '5.2': 'IDP RD1 to RD7 $72.7m (2024) are development road projects; resilience share not costed.',
 '5.3': 'IDP CE5 and CE6 included (5.3.2). MA1 $15m not added (5.3.4 blank).',
 '5.4': 'IDP AV5 included (5.4.5). AV2 $3.85m, AV3 $80m, AV4 $66m are development projects, not added.',
 '6.3': 'IDP HE1 $135m, HE4 $0.6m, HE5 $15.6m, HE6 $1.1m are development projects, not added.',
}
for a, (ar, subs) in acts.items():
    ch[f'G{ar}'] = f'=SUM(H{subs[0]}:H{subs[-1]})'; ch[f'J{ar}'] = f'=SUM(K{subs[0]}:K{subs[-1]})'
    for col in 'MNO': ch[f'{col}{ar}'] = f'=SUM({col}{subs[0]}:{col}{subs[-1]})'
    c = cnt[a]; bits = []
    for k, lab in ((1, 'Past JSAP'), (2, 'IDP'), (3, 'Other source')):
        if c[k]: bits.append(f'{lab} {c[k]}')
    if c['incl']: bits.append(f'covered elsewhere {c["incl"]}')
    if c['blank']: bits.append(f'not costed {c["blank"]} (yellow)')
    ch[f'I{ar}'] = (f'Sum of {len(subs)} sub-activities. ' + ', '.join(bits) + '.' +
                    (' PARTIAL TOTAL: excludes sub-activities not yet costed.' if c['blank'] else '') +
                    " Workings in 'Worked examples' and 'Cost basis'.")
    ch[f'L{ar}'] = 'Sum of sub-activities. 2% of CAPEX per year for programmes, 3% for infrastructure.'
    ch[f'N{ar}'].comment = None
    if a in XC:
        from openpyxl.comments import Comment
        ch[f'N{ar}'].comment = Comment(XC[a], 'Katrina Rae')
    for col in 'GJMNO': ch[f'{col}{ar}'].number_format = ACC
    for col in 'GIJLMNO': ch[f'{col}{ar}'].font = F(); ch[f'{col}{ar}'].alignment = W
    for col in 'HKPQR': ch[f'{col}{ar}'].value = None

# ===================== Worked examples =====================
we = wb.create_sheet('Worked examples', index=wb.sheetnames.index(BS))
we['A1'] = 'Worked examples: how each Chuuk CAPEX estimate was calculated (all packages)'; we['A1'].font = F(sz=14, bold=True, color=NAVY)
we['A2'] = ('Each source line: original cost x FX to USD x inflation to 2026 (US CPI-U) x scale to Chuuk = estimate (USD 2026). '
            'Sub-activity = sum of its source lines; activity = sum of its sub-activities. Yellow = not costed (no defensible source found). Linked to the Cost basis tab.')
we['A2'].alignment = W; we['A2'].font = F(italic=True); we.merge_cells('A2:Q2'); we.row_dimensions[2].height = 32
we['A4'] = 'Total CAPEX, all Chuuk activities costed (USD 2026)'; we['A4'].font = F(bold=True)
WH = 6
hdr(we, WH, ['Activity', 'Sub-activity', 'Description', 'Source type', 'Source document', 'Reference', 'Original cost', 'Currency', 'Price year',
             'x FX to USD', 'x Inflation to 2026', 'Scale basis', 'x Scale', 'Estimate (USD 2026)', 'Working', 'Why this source', 'Check vs Chuuk tab'],
    [9, 11, 50, 16, 34, 11, 13, 9, 9, 9, 11, 24, 8, 15, 46, 50, 12])
bsrow = {}
for k, t in enumerate(RS): bsrow.setdefault(t[0], []).append(HR + 1 + k)
r = WH + 1; atots = []
for a, (ar, subs) in acts.items():
    arow = r; we.cell(r, 1, a); we.cell(r, 3, ch.cell(ar, 3).value); body(we, r, 17, TAN, True); r += 1; stots = []
    for sr in subs:
        s = ch.cell(sr, 5).value; srow = r
        we.cell(r, 1, a); we.cell(r, 2, s); we.cell(r, 3, ch.cell(sr, 6).value); body(we, r, 17, TINT, True); r += 1; capex = []
        if s in M.BLANK or s in M.INCLUDED:
            we.cell(r, 4, 'Not costed' if s in M.BLANK else 'Covered elsewhere')
            we.cell(r, 16, M.BLANK.get(s) or M.INCLUDED.get(s))
            body(we, r, 17, YEL if s in M.BLANK else None)
            if s in M.INCLUDED: we.cell(r, 14, 0); capex.append(r)
            r += 1
        for brr in bsrow.get(s, []):
            L = lambda c: f'={Q}!{c}{brr}'
            for j, v in {3: L('E'), 4: L('B'), 5: L('C'), 6: L('D'), 7: L('F'), 8: L('G'), 9: L('H'), 10: L('J'), 11: L('I'), 12: L('K'), 13: L('L'), 14: L('N'), 16: L('O')}.items():
                we.cell(r, j, v)
            we.cell(r, 15, ('=IF(H{r}="USD","$","NZD ")&TEXT(G{r},"#,##0")&" ("&I{r}&")"&IF(J{r}=1,""," x "&TEXT(J{r},"0.000")&" FX")'
                            '&" x "&TEXT(K{r},"0.000")&" inflation"&IF(M{r}=1,""," x "&TEXT(M{r},"0.00")&" scale")&" = $"&TEXT(N{r},"#,##0")').format(r=r))
            if b.cell(brr, 13).value == 'CAPEX': capex.append(r)
            else: we.cell(r, 4, f'={Q}!B{brr}&" (annual OPEX, not in CAPEX)"')
            body(we, r, 17)
            we.cell(r, 7).number_format = '#,##0'; we.cell(r, 14).number_format = '#,##0'
            for j in (10, 11, 13): we.cell(r, j).number_format = '0.000'
            r += 1
        if s in M.BLANK:
            we.cell(srow, 14).fill = YEL; we.cell(srow, 15, 'Not costed'); we.cell(srow, 17, '=IF(Chuuk!H%d="","Matches","Check")' % sr)
        else:
            we.cell(srow, 14, '=' + ('+'.join(f'N{x}' for x in capex) if capex else '0')); we.cell(srow, 15, 'Sub-activity total')
            we.cell(srow, 17, f'=IF(ABS(N{srow}-Chuuk!H{sr})<1,"Matches","Check")')
        we.cell(srow, 14).number_format = '#,##0'; stots.append(srow)
    we.cell(arow, 14, '=' + '+'.join(f'N{x}' for x in stots)); we.cell(arow, 14).number_format = '#,##0'
    we.cell(arow, 15, 'Activity total'); we.cell(arow, 17, f'=IF(ABS(N{arow}-Chuuk!G{ar})<1,"Matches","Check")')
    atots.append(arow); r += 1
we['N4'] = '=' + '+'.join(f'N{x}' for x in atots); we['N4'].number_format = '#,##0'; we['N4'].font = F(bold=True)
we.freeze_panes = f'D{WH+1}'

# ===================== State factors (logical data table) =====================
def state_codes(name):
    ws = wb[name]; out = {}
    for rr in range(1, ws.max_row + 1):
        a_, s_ = ws.cell(rr, 2).value, ws.cell(rr, 5).value
        if a_ and s_ is None: out[str(a_)] = ws.cell(rr, 3).value
    return out
KOSA, YAPA = state_codes('Kosrae'), state_codes('Yap')
YMERGE = {'3.7': '3.3', '3.6': '3.5', '4.1': '4.7', '4.2': '4.7', '4.3': '4.7'}
def smap(code, st):
    if st == 'Pohnpei': return code
    codes = KOSA if st == 'Kosrae' else YAPA
    if st == 'Yap' and code in YMERGE: return YMERGE[code]
    return code if code in codes else None
TT3 = {}
def ttype(t):
    s, step, sk = t[0], t[1], t[8]
    if s in M.TT: return M.TT[s]
    if step == 2: return 'X'
    if sk in ('popYap', 'popPni'): return 'P'
    if sk in ('regions', 'sites10'): return 'T'
    return 'S'
TTN = {'S': 'Same in every State', 'P': 'Population factor', 'T': 'Sites factor', 'X': 'State-specific (not transferred)'}
WHY = {'S': 'One per State whatever its size (study, plan, policy, database, protocol, training of State staff).',
       'P': 'Community programme; cost rises with the number of people and households served.',
       'T': 'Pilot or site works; cost rises with the number of sites.',
       'X': 'Chuuk IDP project or Chuuk-specific capital works. Each State costs its own from its IDP or JSAP.'}
sf = wb.create_sheet('State factors', index=wb.sheetnames.index('Worked examples'))
sf['A1'] = 'State factors: Chuuk costs carried to Kosrae, Pohnpei, Yap and FSM (USD 2026, CAPEX) - logical data table'
sf['A1'].font = F(sz=14, bold=True, color=NAVY)
sf['A2'] = ('Each Chuuk source line is tagged Same, Population factor, Sites factor or State-specific. State value = Chuuk value x factor, '
            "counted only where the State's tab has that activity code (Yap merges some Chuuk activities, shown in the code columns). "
            'State-specific lines are zero for other States, which cost their own from their IDP or JSAP. Not-costed (yellow) Chuuk sub-activities carry nothing. '
            'Pohnpei tab has no activity list yet, so the full NAP list is assumed. FSM total = sum of the four States.')
sf['A2'].alignment = W; sf['A2'].font = F(italic=True); sf.merge_cells('A2:M2'); sf.row_dimensions[2].height = 60
hdr(sf, 4, ['State', 'Population (2010 Census)', 'Population factor vs Chuuk', 'Sites (count)', 'Sites factor vs Chuuk', 'Sites basis'])
FR = {}
for i, (s_, pop, sites, basis) in enumerate([
        ('Chuuk', 48654, 5, '5 regions: Northern Namoneas, Southern Namoneas, Faichuk, Mortlocks, Northwest'),
        ('Kosrae', 6616, 4, '4 municipalities: Lelu, Malem, Utwe, Tafunsak (proposed, to confirm)'),
        ('Pohnpei', 36196, 6, '5 main-island municipalities outside Kolonia plus 1 outer-island group (proposed, to confirm)'),
        ('Yap', 11376, 3, 'Yap Proper, Ulithi, Woleai (proposed, to confirm)')], start=5):
    FR[s_] = i
    for j, v in enumerate([s_, pop, f'=B{i}/$B$5', sites, f'=D{i}/$D$5', basis], 1): sf.cell(i, j, v)
    body(sf, i, 6); sf.cell(i, 2).font = F(color='FF0000FF'); sf.cell(i, 4).font = F(color='FF0000FF')
    sf.cell(i, 2).number_format = '#,##0'; sf.cell(i, 3).number_format = '0.000'; sf.cell(i, 5).number_format = '0.00'
codes = list(acts.keys())
extra_codes = sorted({c for c in list(KOSA) + list(YAPA) if c not in acts}, key=lambda x: [int(p) for p in x.split('.')])
SR = 11
sf.cell(SR - 1, 1, 'SUMMARY BY ACTIVITY').font = F(bold=True, color=NAVY)
hdr(sf, SR, ['NAP code', 'Activity', 'Chuuk', 'Kosrae', 'Pohnpei', 'Yap', 'FSM total', 'Same (per State)', 'Population-factored (Chuuk)',
             'Sites-factored (Chuuk)', 'State-specific (Chuuk only)', 'Kosrae code', 'Yap code'],
    [9, 46, 14, 13, 13, 13, 14, 14, 14, 14, 14, 12, 12])
LR = SR + len(codes) + len(extra_codes) + 6
sf.cell(LR - 1, 1, 'LINE-LEVEL LOGIC (one row per Chuuk source line)').font = F(bold=True, color=NAVY)
hdr(sf, LR, ['NAP code', 'Sub-activity', 'Source line', 'Transfer type', 'Why', 'Chuuk', 'Kosrae code', 'Kosrae', 'Pohnpei code', 'Pohnpei', 'Yap code', 'Yap', 'FSM total'])
r = LR + 1; first = r
def fac(st, t): i = FR[st]; return {'S': '1', 'P': f'$C${i}', 'T': f'$E${i}', 'X': '0'}[t]
for k, t in enumerate(RS):
    if t[9] != 'CAPEX': continue
    brr = HR + 1 + k; act = '.'.join(t[0].split('.')[:2]); tt = ttype(t)
    sf.cell(r, 1, act); sf.cell(r, 2, t[0]); sf.cell(r, 3, f'={Q}!D{brr}&" "&{Q}!E{brr}'); sf.cell(r, 4, TTN[tt]); sf.cell(r, 5, WHY[tt])
    sf.cell(r, 6, f'={Q}!N{brr}')
    for cc, cv, st in ((7, 8, 'Kosrae'), (9, 10, 'Pohnpei'), (11, 12, 'Yap')):
        code = smap(act, st); sf.cell(r, cc, code or 'Not in State list')
        sf.cell(r, cv, f'=F{r}*{fac(st, tt)}' if code else 0)
    sf.cell(r, 13, f'=F{r}+H{r}+J{r}+L{r}')
    body(sf, r, 13, TAN if tt == 'X' else None)
    for j in (6, 8, 10, 12, 13): sf.cell(r, j).number_format = NUM
    r += 1
for act, item, cost, st in [('4.8', 'Kosrae JSAP 2015 Objective 3.5 invasive species (objective total)', 32442, 'Kosrae'),
                            ('4.8', 'Yap JSAP 2015 3.3.1 invasive species survey and community engagement', 34500, 'Yap')]:
    sf.cell(r, 1, act); sf.cell(r, 2, '4.8 (State)'); sf.cell(r, 3, f'{item}, ${cost:,} (2015) x CPI 2015 to 2026')
    sf.cell(r, 4, 'State source (own past JSAP)'); sf.cell(r, 5, 'Activity exists in this State only; costed from its own past JSAP (Step 1).')
    sf.cell(r, 6, 0); v = f'={cost}*{Q}!$B$5/{Q}!$B$16'
    sf.cell(r, 7, '4.8' if st == 'Kosrae' else 'Not in State list'); sf.cell(r, 8, v if st == 'Kosrae' else 0)
    sf.cell(r, 9, 'Not in State list'); sf.cell(r, 10, 0)
    sf.cell(r, 11, '4.8' if st == 'Yap' else 'Not in State list'); sf.cell(r, 12, v if st == 'Yap' else 0)
    sf.cell(r, 13, f'=F{r}+H{r}+J{r}+L{r}'); body(sf, r, 13)
    for j in (6, 8, 10, 12, 13): sf.cell(r, j).number_format = NUM
    r += 1
last = r - 1
sf.cell(r, 5, 'Total').font = F(bold=True)
for j in (6, 8, 10, 12, 13):
    c = sf.cell(r, j, f'=SUM({CL(j)}{first}:{CL(j)}{last})'); c.number_format = NUM; c.font = F(bold=True)
L = lambda c: f'${c}${first}:${c}${last}'
sr = SR + 1
for code in codes + extra_codes:
    nm = ch.cell(acts[code][0], 3).value if code in acts else (KOSA.get(code) or YAPA.get(code))
    sf.cell(sr, 1, code); sf.cell(sr, 2, nm if code in acts else f'{nm} (State-only activity)')
    for j, col in ((3, 'F'), (4, 'H'), (5, 'J'), (6, 'L')): sf.cell(sr, j, f'=SUMIFS({L(col)},{L("A")},A{sr})')
    sf.cell(sr, 7, f'=SUM(C{sr}:F{sr})')
    for j, key in ((8, 'S'), (9, 'P'), (10, 'T'), (11, 'X')):
        sf.cell(sr, j, f'=SUMIFS({L("F")},{L("A")},A{sr},{L("D")},"{TTN[key]}")')
    sf.cell(sr, 12, (smap(code, 'Kosrae') if code in acts else (code if code in KOSA else None)) or '-')
    sf.cell(sr, 13, (smap(code, 'Yap') if code in acts else (code if code in YAPA else None)) or '-')
    body(sf, sr, 13)
    for j in range(3, 12): sf.cell(sr, j).number_format = NUM
    if code not in acts and code != '4.8':
        for j in (4, 6):
            if (j == 4 and code in KOSA) or (j == 6 and code in YAPA): sf.cell(sr, j).fill = YEL
    sr += 1
sf.cell(sr, 2, 'Total').font = F(bold=True)
for j in range(3, 12):
    c = sf.cell(sr, j, f'=SUM({CL(j)}{SR+1}:{CL(j)}{sr-1})'); c.number_format = NUM; c.font = F(bold=True); c.fill = TINT
gref = '+'.join(f'Chuuk!G{acts[a][0]}' for a in acts)
sf.cell(sr + 1, 2, 'Check: Chuuk total equals Chuuk tab'); sf.cell(sr + 1, 3, f'=IF(ABS(C{sr}-({gref}))<1,"Matches","Check")')
sf.cell(sr + 2, 2, ('Yellow: activity exists only in that State tab and has no Chuuk basis; to be costed from that State\'s own sources. '
                    'State totals exclude State-specific capital projects and Chuuk sub-activities not yet costed, so they are lower bounds.'))
sf.cell(sr + 2, 2).alignment = W; sf.row_dimensions[sr + 2].height = 45

# ===================== Source usage check =====================
uc = wb.create_sheet('Source check', index=wb.sheetnames.index(BS) + 1)
uc['A1'] = 'Source check: use of Chuuk JSAP 2016 costs (cross-check for double counting and omissions)'; uc['A1'].font = F(sz=14, bold=True, color=NAVY)
OBJ = [('1.1','Shoreline protection',3930782),('1.2','Infrastructure to withstand disaster risk and climate change',11634624),
       ('1.3','Infrastructure for settlement on higher grounds',10133182),('1.4','Disaster preparedness in all communities',2889095),
       ('1.5','Typhoon-proof shelters in all communities',2811710),('1.6','Post-disaster response strengthened',15484700),
       ('1.7','Settlement options for relocation of low-lying island communities',8340529),('2.1','Mangrove planting',344130),
       ('2.2','Mountain protection and rehabilitation',13720350),('2.3','Strengthen fire response',376613),
       ('2.4','Sustain productive agriculture (appendix total)',3904025),('3.1','Private sector capacity for disaster preparedness',42049),
       ('3.2','Tax incentives',22496),('3.3','Insurance schemes',31652),('3.4','Private sector climate finance',21355),
       ('4.1','Water security',1579588),('4.2','Waste management and recycling',971411),('4.3','Data collection',211819),
       ('5.1','Sanitation coverage',1378350),('5.2','Health security',3678920),('6.1','Skilled labour for preparedness and response',172000)]
hdr(uc, 3, ['JSAP 2016 objective', 'Objective', 'JSAP 2016 total (2016 USD)', 'Used in NAP costing (2016 USD)', 'Not used (2016 USD)', 'Share used', 'NAP sub-activities using it'],
    [11, 50, 16, 16, 16, 10, 60])
used = collections.defaultdict(float); where = collections.defaultdict(list)
for t in RS:
    if t[2] == 'J16':
        o = '.'.join(t[3].split('.')[:2]); used[o] += t[5]; where[o].append(t[0])
r = 4
for o, nm, tot in OBJ:
    vals = [o, nm, tot, used[o], f'=C{r}-D{r}', f'=IF(C{r}=0,0,D{r}/C{r})', ', '.join(dict.fromkeys(where[o]))]
    for j, v in enumerate(vals, 1): uc.cell(r, j, v)
    body(uc, r, 7)
    for j in (3, 4, 5): uc.cell(r, j).number_format = '#,##0'
    uc.cell(r, 6).number_format = '0%'; r += 1
uc.cell(r, 2, 'Total').font = F(bold=True)
for j in (3, 4, 5):
    uc.cell(r, j, f'=SUM({CL(j)}4:{CL(j)}{r-1})').number_format = '#,##0'; uc.cell(r, j).font = F(bold=True)
uc.cell(r, 6, f'=D{r}/C{r}').number_format = '0%'
r += 2
uc.cell(r, 1, 'Main Chuuk JSAP 2016 lines not used, and why').font = F(bold=True, color=NAVY); r += 1
hdr(uc, r, ['JSAP 2016 line', 'Item', 'Cost (2016 USD)', 'Reason not used', '', '', 'Team decision needed?']); r += 1
UNUSED = [
 ('1.1.3', 'Shoreline awareness: brochures, flyers, comic books; radio; communication strategy (part)', 542694 + 4569 + 10554, 'Brochure line looks high; radio and strategy lines first used for 3.1.6, which was later removed as an analogue. No direct NAP sub-activity for shoreline awareness.', 'Yes'),
 ('1.3.1', 'Construction of inland infrastructure', 10000000, 'Outside NAP 4.5 planning scope (planning only).', 'Yes'),
 ('1.6.3', 'Medical dispensary for each community: identify sites, survey, equip, hand over, training (excluding store)', 2150515 + 2150515 + 451300 + 211100 + 480500, 'Identify-sites and survey lines are identical ($2.15m each) and look like transcription errors; dispensary build sits in IDP HE5 (development project).', 'Yes'),
 ('1.6.4', 'Disability access for safe shelters: assess, design, build', 7827990, 'No NAP sub-activity explicitly covers shelter accessibility works; candidate for 1.2.2. Lines look high.', 'Yes'),
 ('1.7.1', 'Secure sea and air transport; secure land for resettlement', 4081050, 'Outside NAP 4.5 planning scope.', 'Yes'),
 ('2.2.7', 'Resettlement: vulnerability assessments, displacement site, develop new sites', 2821100, 'No NAP sub-activity for landslide resettlement works.', 'Yes'),
 ('2.4 vs Table 10', 'Agriculture objective total', 3904025 - 1829225, 'JSAP Table 10 shows $1,829,225 but appendix lines total $3,904,025; appendix lines used.', 'No'),
 ('3.1 to 3.3', 'Private sector awareness, tax incentives, insurance', 42049 + 22496 + 31652, 'Private sector measures sit outside Packages 1 to 6 sub-activities.', 'No'),
 ('4.2.1', 'Community incinerators, waste segregation, school and community awareness', 33000 + 17700 + 60500, 'No matching NAP 2.7 sub-activity.', 'Yes'),
 ('4.2.2', 'Recycling: can deposit legislation drafted and endorsed', 44801, '2.7 title covers recycling but no sub-activity does.', 'Yes'),
 ('5.1.1', 'Regulation for household toilets', 32400, 'No matching NAP 2.6 sub-activity.', 'No'),
 ('5.2.1, 5.2.3, 5.2.4', 'Health education, healthy diet and go-local fairs, food regulation', 717700 + 755150 + 173270, 'No Chuuk NAP sub-activity (Kosrae and Yap have 6.8 Community Health Risk Awareness).', 'Yes'),
 ('5.2.2', 'Disaster relief fund', 1016400, 'A fund, not an activity.', 'No'),
]
for ln in UNUSED:
    for j, v in enumerate([ln[0], ln[1], ln[2], ln[3], '', '', ln[4]], 1): uc.cell(r, j, v)
    body(uc, r, 7); uc.cell(r, 3).number_format = '#,##0'; uc.merge_cells(start_row=r, start_column=4, end_row=r, end_column=6); r += 1
r += 1
uc.cell(r, 1, 'Unit costs from other States reused for more than one Chuuk sub-activity (different deliverables, same type of task)').font = F(bold=True, color=NAVY); r += 1
reuse = collections.defaultdict(list)
for t in RS: reuse[(t[2], t[3], t[4], t[5])].append(t[0])
for (d, ref, item, cost), ss in reuse.items():
    if len(set(ss)) > 1:
        for j, v in enumerate([f'{M.SHORT[d]} {ref}', item, cost, 'Used for: ' + ', '.join(dict.fromkeys(ss))], 1): uc.cell(r, j, v)
        body(uc, r, 4); uc.cell(r, 3).number_format = '#,##0'; r += 1

# ===================== Change log =====================
lg = wb.create_sheet('Change log')
lg['A1'] = 'Change log: Chuuk tab, all activities (3 Nov 2026)'; lg['A1'].font = F(sz=14, bold=True, color=NAVY)
lg['A2'] = ('Values in the live workbook before this update. Previous activity-level figures for 1.2 to 6.1 were placeholders whose '
            'justifications did not match their activities (for example 2.2 Rainwater cited landslide stabilisation). Rows 110 to 117 held an earlier paste of the 3.1 costing.')
lg['A2'].alignment = W; lg.merge_cells('A2:F2'); lg.row_dimensions[2].height = 45
hdr(lg, 4, ['Code', 'Row', 'Previous CAPEX', 'Previous CAPEX justification', 'Previous OPEX', 'Previous OPEX justification'], [10, 7, 16, 60, 14, 50])
rr = 5
for code, row, old in log:
    cap = old.get('G', old.get('H')); opx = old.get('J', old.get('K'))
    if cap is None and old.get('I') is None and opx is None: continue
    for j, v in enumerate([code, row, cap, old.get('I'), opx, old.get('L')], 1):
        if isinstance(v, str) and v.startswith('='): v = 'Formula (broken external link): ' + v[1:]
        lg.cell(rr, j, v).alignment = W
    rr += 1

wb.save(OUT)
print('saved', OUT, 'basis lines', len(RS))

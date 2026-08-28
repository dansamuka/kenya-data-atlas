from pathlib import Path

p = Path('assets/compare.js')
s = p.read_text(encoding='utf-8')

replacements = [
("""        headline = delta === 0
          ? 'rent takes about the same share of household spending'
          : `rent takes ${pp} percentage points ${delta > 0 ? 'more' : 'less'} of household spending`;""", """        headline = delta === 0
          ? 'feel about the same squeeze from rent in the household budget'
          : delta > 0
            ? `feel a tighter squeeze on housing, with rent taking ${pp} percentage points more of the household budget`
            : `have a little more breathing room on housing, with rent taking ${pp} percentage points less of the household budget`;"""),
("""        headline = delta === 0
          ? 'home ownership is about as common'
          : `be ${pp} percentage points ${delta > 0 ? 'more' : 'less'} likely to live in an owner-occupied home`;""", """        headline = delta === 0
          ? 'have about the same shot at living in a home you own'
          : delta > 0
            ? `have a better shot at owning the roof over your head — owner-occupied homes are ${pp} percentage points more common`
            : `have a tougher shot at owning the roof over your head — owner-occupied homes are ${pp} percentage points less common`;"""),
("""        headline = `have ${countDifferencePhrase(a, b, 'health facilities')} in the county`;""", """        const facilityRatio = a > 0 ? b / a : null;
        headline = delta === 0
          ? 'have about the same number of medical facilities around the county'
          : delta > 0
            ? facilityRatio && facilityRatio >= 1.5
              ? `have many more medical facilities around the county — about ${facilityRatio.toFixed(1)}× as many are listed`
              : `have ${countDifferencePhrase(a, b, 'health facilities')} around the county`
            : `have ${countDifferencePhrase(a, b, 'health facilities')} around the county`;"""),
("""        headline = delta === 0
          ? 'see about the same share of people aged 3+ in school or learning'
          : `see ${pp} percentage points ${delta > 0 ? 'more' : 'fewer'} people aged 3+ in school or a learning institution`;""", """        headline = delta === 0
          ? 'notice about the same student presence in the community'
          : delta > 0
            ? `notice a more student-heavy community, with ${pp} percentage points more people aged 3+ in school or a learning institution`
            : `notice a less student-heavy community, with ${pp} percentage points fewer people aged 3+ in school or a learning institution`;"""),
("""        headline = delta === 0
          ? 'see about the same share of working-age adults active in the labour force'
          : `see ${pp} percentage points ${delta > 0 ? 'more' : 'fewer'} working-age adults active in the labour force`;""", """        headline = delta === 0
          ? 'live in a labour market with about the same share of working-age adults active'
          : delta > 0
            ? `live in a busier labour market, with ${pp} percentage points more working-age adults working or actively looking for work`
            : `live in a quieter labour market, with ${pp} percentage points fewer working-age adults working or actively looking for work`;"""),
("""        headline = delta === 0
          ? 'pay about the same for a litre of Super Petrol'
          : `pay KSh ${Math.abs(delta).toFixed(2)} ${delta > 0 ? 'more' : 'less'} per litre for Super Petrol`;""", """        headline = delta === 0
          ? 'feel about the same hit at the petrol pump'
          : delta > 0
            ? `feel a little more pinch at the pump, paying KSh ${Math.abs(delta).toFixed(2)} more for every litre of Super Petrol`
            : `save a bit at the pump, paying KSh ${Math.abs(delta).toFixed(2)} less for every litre of Super Petrol`;"""),
("""        headline = delta === 0
          ? 'share the county with about the same number of people'
          : `share the county with ${pctAbs?.toFixed(0) || 'a different number of'}% ${delta > 0 ? 'more' : 'fewer'} people`;""", """        headline = delta === 0
          ? 'experience a county with about the same number of residents'
          : delta > 0
            ? `experience a busier, more populous county, sharing it with ${pctAbs?.toFixed(0) || 'many'}% more residents`
            : `experience a less populous county, sharing it with ${pctAbs?.toFixed(0) || 'many'}% fewer residents`;"""),
("""        headline = delta === 0
          ? 'live in a county covering about the same land area'
          : ratio >= 1
            ? `live in a county about ${ratio.toFixed(ratio >= 10 ? 0 : 1)} times larger by land area`
            : `live in a county about ${(1 / ratio).toFixed((1 / ratio) >= 10 ? 0 : 1)} times smaller by land area`;""", """        headline = delta === 0
          ? 'have about the same amount of ground to cover across the county'
          : ratio >= 1
            ? `have far more ground to cover, living in a county about ${ratio.toFixed(ratio >= 10 ? 0 : 1)} times the physical size`
            : `have less ground to cover, living in a county about ${(1 / ratio).toFixed((1 / ratio) >= 10 ? 0 : 1)} times smaller by land area`;"""),
("""        headline = delta === 0
          ? 'live under a county government with about the same budget'
          : `live under a county government with a ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% ${delta > 0 ? 'larger' : 'smaller'} budget`;""", """        headline = delta === 0
          ? 'rely on a county government working with about the same size budget'
          : delta > 0
            ? `rely on a county government with deeper pockets — its published budget is ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% larger`
            : `rely on a county government with a leaner budget — its published budget is ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% smaller`;""")
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f'Expected template not found:\n{old}')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print(f'Applied {len(replacements)} lived-experience language replacements')

# Fonts used by `render-screenshots.py`

`Inter-var-subset.ttf` — Inter, copyright The Inter Project Authors, licensed
under the **SIL Open Font License 1.1** (https://scripts.sil.org/OFL).

It is a subset of the upstream variable font (`inter-ui` 4.1.1,
`variable/InterVariable.woff2`), reduced to ASCII plus `₦ — – · •` and the
latin ligature/kern features the three screens need. 82 KB instead of 330 KB,
and committed on purpose: the screenshot renderer has to produce byte-identical
images on a machine with no network, and a test asserts the images are current.

Regenerate with fontTools:

```sh
python3 -m fontTools.ttLib.woff2 decompress InterVariable.woff2 -o InterVar.ttf
python3 - <<'PY'
from fontTools import subset
f = subset.load_font('InterVar.ttf', subset.Options())
o = subset.Options(); o.layout_features = ['kern','liga','calt','tnum']; o.flavor = None
s = subset.Subsetter(options=o)
s.populate(text=''.join(chr(c) for c in range(32,127)) + '\u20a6\u2014\u2013\u00b7\u2022')
s.subset(f); f.save('Inter-var-subset.ttf')
PY
```

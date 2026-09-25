# Paper draft

`main.tex` is the first complete two-column paper draft. The layout uses the
standard `article` class so it does not depend on a downloaded venue template.
The paper is intended for arXiv; the two-column format is only a working
research-paper layout.

## Compile

From this directory:

```bash
tectonic main.tex --keep-logs --keep-intermediates
```

The bibliography contains verified primary-paper metadata from the literature
and novelty-positioning pass. Re-run Tectonic after bibliography edits so its
BibTeX pass can refresh the references.

## Figure provenance

Files in `figures/` are Matplotlib-rendered PNGs whose numerical inputs are the
frozen JSON payloads in `../analysis/synthesis/figures/`; no series is recomputed
from raw result directories. Regenerate them with:

```bash
uv run --with matplotlib python generate_figures.py
```

The cost--ESR plot reads the frozen `cost-esr-frontier.json` payload but uses the
paper's more conservative “operating points” terminology. Plot values are not
recomputed or altered.

The manifests used by the synthesis are:

- M3: `../results/_matrix/2026-09-24T055854Z.json`
- M4: `../results/_k-sweep/2026-09-24T140621Z.json`
- Adaptive: `../results/_adaptive-eval/2026-09-24T045743Z.json`

Generated PDFs and Tectonic intermediates are ignored by `paper/.gitignore`.

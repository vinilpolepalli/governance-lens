# Home page copy tightening (mobile-first action priority)

Design feedback: a visitor must read a long intro before reaching the first useful action. Fix copy only, no structural redesign, keep the light navy theme, keep all disclosure semantics truthful. Build must pass; do not deploy or push.

1. Hero sub-copy: replace the current long paragraph with ONE sentence: "Governance Lens pulls a company's real DEF 14A proxy statement from SEC EDGAR, applies your voting policy, and shows FOR / AGAINST / FLAG with the fact that drove each call." Keep the headline and eyebrow as they are.
2. Move the caveats to where the action and results are. In the "Add a company by ticker" card, under the existing description, keep/adjust a single short note: extraction is automated, anything the parser cannot find is shown as "Not extracted", and items without enough facts get REVIEW instead of a guess. If that duplicates the existing card copy, merge rather than repeat.
3. Keep the flat "How it works" hairline list below the companies, unchanged.
4. Keep SAMPLE DATA / LIVE FROM EDGAR chips, footer disclaimers, and every other page untouched.
5. Rebuild, run the scanner (python3 ~/unslop/devibe_scan.py .) to confirm still clean, run the app, and re-screenshot home at 1280x900 to /tmp/gl3-home.png and at 390x844 to /tmp/gl3-mobile.png.

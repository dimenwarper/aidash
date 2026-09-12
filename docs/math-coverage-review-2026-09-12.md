# Math coverage review — September 12, 2026

The catalogue expanded from 5 to 31 public reports: 15 solution/disproof reports and 16 advances. These are reports with differing verification status, not a count of established theorems.

## Scope and method

Reviewed the five existing entries, the August 1 collection, later reports through September 12, and historical AI-assisted mathematical discovery from 2021 onward. Searched news and checked original papers, author announcements, public proof repositories and firsthand expert explanations. The automated Google News discovery pass covered January 2023–July 2026 and August 1–September 12, 2026; raw responses are archived and 396 additional headlines entered the unreviewed queue. Five expanded query families now cover named systems and broader mathematical topics.

This is a source audit, not a mathematical proof verification or exhaustive census. We did not independently rebuild Lean projects. A released certificate, expert follow-up and journal acceptance are distinct evidence states. Status reflects the September 12 review, while the timeline uses public announcement dates; past selections are not snapshots of what reviewers knew at the time.

## Counting decisions

- Count new mathematical results and significant advances on longstanding problems. Exclude formalizations of already-known results, benchmark totals and rediscoveries as first resolutions.
- Formal verification of a new discovery remains eligible: non-sofic groups and the new Grothendieck counterexample are not excluded just because they have Lean artifacts.
- One paper can contain distinct named conjectures. The August collection contributes 11 entries from 10 chapters because compactness and degeneracy are separate conjectures. There is no extra umbrella entry for the collection.
- Related bound families share an entry. Later independent derivations of the same conclusion stay attached to that entry. A later improved numerical bound is a distinct dated milestone; rediscovering the same bound is not.
- Forced Euler and forced Boussinesq are partial advances on the central regularity problems. Their smooth external forcing is explicit. Unforced Euler and forced Navier–Stokes have separate statements and proof-claim entries.

## Added reports

| Public date | Result and primary evidence | Type | Current status |
| --- | --- | --- | --- |
| 2026-09-08 | [Three-dimensional Euler: unforced finite-time blowup](https://cdn.openai.com/pdf/315b36cd-ec98-4023-8342-93345194ece1/euler.pdf) | Solution/disproof report | Claim under review |
| 2026-09-07 | [3D Euler equations: blowup with smooth forcing](https://cims.nyu.edu/~tristanb/euler.pdf) | Advance | Preprint; Lean verification reported |
| 2026-09-07 | [2D Boussinesq equations: blowup with smooth forcing](https://cims.nyu.edu/~tristanb/boussinesq.pdf) | Advance | Preprint; Lean verification reported |
| 2026-09-03 | [No infinite cluster at critical bond percolation](https://github.com/anthropics/formal-math/tree/795efb86f191735c5481675763537cfb4ff37e55/percolation) | Solution/disproof report | Machine-checked claim; human review pending |
| 2026-08-19 | [Yau–Tian–Donaldson conjecture: general cscK form](https://arxiv.org/html/2608.19301v1) | Solution/disproof report | Counterexample claim under review |
| 2026-08-17 | [Matrix-multiplication exponent: tighter upper bound](https://arxiv.org/html/2608.16884v1) | Advance | Certified numerical bound in preprint |
| 2026-08-01 | [High-dimensional sphere packing](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=5) | Advance | New upper bound; Lean certificate |
| 2026-08-01 | [Quantum parallel repetition](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=158) | Solution/disproof report | Reported theorem; Lean certificate |
| 2026-08-01 | [Permanent: arithmetic complexity bounds](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=118) | Advance | New lower bounds; Lean certificate |
| 2026-08-01 | [Existence of non-sofic groups](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=82) | Solution/disproof report | Construction reported; independent follow-up |
| 2026-08-01 | [Multicolor triangle Ramsey numbers](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=233) | Solution/disproof report | Reported resolution; Lean certificate |
| 2026-08-01 | [Erdős–Simonovits compactness conjecture](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=241) | Solution/disproof report | Reported counterexample; Lean certificate |
| 2026-08-01 | [Erdős degeneracy conjecture](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=241) | Solution/disproof report | Reported counterexample; Lean certificate |
| 2026-08-01 | [Ehrhart’s volume conjecture](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=223) | Solution/disproof report | Proof reported; verification incomplete |
| 2026-08-01 | [Connes’s rigidity conjecture](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=100) | Solution/disproof report | Counterexamples reported; separate derivation |
| 2026-08-01 | [Closest vector: polynomial-factor hardness](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=187) | Advance | New hardness bound; follow-up research |
| 2026-08-01 | [Binary and spherical coding bounds](https://cdn.openai.com/pdf/ten-proofs-oai.pdf#page=31) | Advance | New upper bounds; Lean certificates |
| 2026-07-29 | [Maxwell's electrostatic equilibrium conjecture](https://arxiv.org/html/2607.27197v1) | Solution/disproof report | Author-verified counterexample preprint |
| 2026-07-14 | [Grothendieck's finite group-scheme question](https://github.com/leanprover-community/mathlib4/pull/41748) | Solution/disproof report | Reviewed, formalized counterexample |
| 2026-04-13 | [Kissing number in 11 dimensions: 604 spheres](https://arxiv.org/html/2606.10402v1) | Advance | Exact construction; improved lower bound |
| 2026-03-10 | [Classical Ramsey numbers: stronger lower bounds](https://arxiv.org/abs/2603.09172v1) | Advance | New constructive bounds |
| 2025-05-14 | [4 × 4 complex matrix multiplication](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) | Advance | New algorithmic bound |
| 2023-12-14 | [Cap-set problem: larger constructions](https://www.nature.com/articles/s41586-023-06924-6) | Advance | Published record construction |
| 2022-10-05 | [Matrix multiplication over a finite field](https://www.nature.com/articles/s41586-022-05172-4) | Advance | Peer-reviewed algorithmic advance |
| 2021-12-01 | [Knot theory: linking geometry and signature](https://www.nature.com/articles/s41586-021-04086-x) | Advance | Peer-reviewed theorem |
| 2021-12-01 | [Kazhdan–Lusztig polynomials: a new formula](https://arxiv.org/abs/2111.15161) | Advance | Peer-reviewed partial advance |

## Corrections and evidence updates

- **Non-sofic groups:** the question is whether every group is sofic; the new construction is non-sofic. The August 1 result is accompanied by [Fournier-Facio](https://arxiv.org/abs/2608.02025), [Kun–Thom](https://arxiv.org/abs/2608.06222) and a [September 11 expert explanation by Andreas Thom](https://terrytao.wordpress.com/2026/09/11/on-the-existence-of-non-sofic-groups/). Follow-up work supports the reported construction, not a classification of groups.
- **Riemann:** refined the old 67.2% description to a 67.25% asymptotic lower bound for simple zeros on the critical line, with the [Alpöge–Furman preprint](https://arxiv.org/abs/2608.13637) and author responsibility. Retained the partial-advance category; the Riemann hypothesis remains unsolved.
- **Jacobian:** removed an unconfirmed model version, retained Fable attribution, and added [merged independent formal checking](https://github.com/google-deepmind/formal-conjectures/pull/4474). The complex two-dimensional case remains open.
- **Quantum repetition and Ehrhart:** used the [September 9 review revision](https://arxiv.org/abs/2608.14673v3). An earlier quantum-proof objection was withdrawn after a PDF extraction error. Ehrhart analytic verification remains incomplete; its separate equality-case result does not resolve those gaps.
- **Connes:** attached the [concurrent Zhou proof](https://arxiv.org/abs/2608.02327) to the same conjecture-level report. It is not independent verification of the stronger infinite-family theorem.
- **Existing Navier–Stokes, unit-distance and 593-sphere entries:** retained their claims and dates, added original manuscripts, and checked for public corrections. No withdrawal was located. The Navier–Stokes provenance update is reflected by linking the latest announcement; no prize award is claimed.

## Date and priority checks

- **Grothendieck:** July 14 public pull request, rather than July 11 private discovery or August 3 merge.
- **Percolation:** September 3 expert public report; the pinned artifact predates it. Independent human refereeing remains pending.
- **604 spheres:** [April 13 public announcement](https://www.together.ai/blog/einsteinarena), reporting a validated construction on April 11. The June 9 paper and Station’s later 604-point constructions are not additional improvements of the bound.
- **Forced fluid equations:** September 7 public report, rather than August discovery/formalization process dates.
- **2021 collaborations:** December 1 Nature/public announcement, with November 30 proof preprints as supporting evidence.

## Deferred or excluded

| Candidate | Decision and reason |
| --- | --- |
| [Freudenthal / Scott–Vogelius inf-sup claim](https://doi.org/10.21203/rs.3.rs-10887173/v1) | Deferred. Proposed proof located; primary AI attribution and independent validation were not verified. |
| [Fermat’s Last Theorem formalization](https://www.anthropic.com/research/formalizing-fermats-last-theorem) | Excluded: verification of known mathematics. |
| [GPT-5.5 sum-product disproofs](https://arxiv.org/abs/2607.20525) | Excluded as a first resolution: the paper describes rediscovery after a human disproof. |
| [PINN Euler singularity evidence](https://arxiv.org/abs/2609.10867) and [conditional stability framework](https://arxiv.org/abs/2609.10860) | Not counted as a proved singularity or another resolution. Numerical evidence and a framework leave stability estimates to certify. The distinct OpenAI proof claim is tracked. |
| [Forced IPM](https://terrytao.wordpress.com/2026/09/07/finite-time-blowup-with-smooth-forcing-term-for-the-incompressible-porous-medium-boussinesq-and-incompressible-euler-equations/) | Excluded as a new resolution: prior Córdoba–Martínez-Zoroa result. The new Boussinesq/Euler variants are included. |
| [HAWK and reduced-round AES cryptanalysis](https://www.anthropic.com/research/discovering-cryptographic-weaknesses) | Outside this pass’s famous-mathematical-problem focus. Neither is a general break of deployed encryption; seven-round AES is not full ten-round AES-128. |
| AlphaDev sorting, production optimization, FunSearch bin packing, Aletheia/FirstProof benchmark totals | Not imported as named mathematical breakthroughs. Useful engineering and benchmark results do not establish a count of new major theorems. |
| [AlphaEvolve broader TCS bounds](https://arxiv.org/abs/2509.18057) | MAX-4-CUT, TSP and graph-certification improvements deferred to a broader theory-of-computation catalogue. The headline matrix and Ramsey advances are included. |
| [Station’s other construction records](https://arxiv.org/abs/2608.23691) | Not bulk-imported from the benchmark paper. Kakeya, sign uncertainty, overlap and Book Ramsey construction families need individual priority and significance checks. Its 604-sphere work is attached to the existing bound improvement. |

## Validation

Catalogue loading checks unique result IDs, dates, allowed categories and both public coverage and primary HTTPS evidence. All 74 Python tests and the existing dashboard UI checks pass. The exported catalogue was also rendered across historical months, both result filters and narrow/wide chart widths; unrelated dashboard datasets were compared with the pre-edit snapshot.

# Reference files

| File | What it is |
| --- | --- |
| `Genshin_Damage_Calculator.xlsx` | The original Excel workbook. Its formulas are the source for the Phase 2 sheet-mode templates. |
| `GcsimRunner.bas` | The Excel macro that drove gcsim from the workbook. |
| `sample_gcsim_config.txt` | A **placeholder test team** (see below). |
| `sample_gcsim_result.json` | gcsim's own result for that placeholder test team (500 iterations, about 35,100 team DPS). |

## The placeholder test team

`sample_gcsim_config.txt` (C0 Neuvillette, Kazuha, Furina, Xilonen) uses **builds chosen for testing, not the owner's real builds**. It is kept only as a test case, to confirm the app produces the same config shape and the same results as gcsim:

- GitHub Actions simulates it after every engine build and checks the DPS against `sample_gcsim_result.json`.
- The automatic tests use `sample_gcsim_result.json` to check the Results screen.
- In the app it is never a default team. It only loads when you tap **Load placeholder test team**, and it is labelled as a placeholder wherever it appears.

Do not read its numbers (DPS shares, energy warnings and so on) as advice about a real team.

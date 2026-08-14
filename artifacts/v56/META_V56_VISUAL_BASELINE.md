# META V56 — Before/After measurements

The repository has no authenticated browser session in this execution. Therefore these are deterministic CSS/shell measurements, not invented browser DOM readings. The existing sanitized V54 JPG remains the visual Mark A; no production rows or credentials were used.

| viewport | shell before | main before | shell after expanded | main after expanded | shell after collapsed | main after collapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1366×768 | 232 | 1134 | 224 | 1142 | 68 | 1298 |
| 1440×900 | 232 | 1208 | 224 | 1216 | 68 | 1372 |

At desktop (`min-width:1360px`) the Inbox content padding is now `8px 12px 12px`; the route consumes the remaining flex height. The command bar is `48px` and the workspace is the remaining flex track. With inline context, the tracks are `24% / 52% / 24%`; without a selected context they are `24% / 76%`.

Computed shell gain from collapse is `156px` at both target viewports (`224 - 68`). The previous 1366×768 workspace used the V54 fixed/clamped stack and the reference screenshot showed footer/composer clipping; V56 removes that route-specific structural overdraw.

Authenticated DOM capture, axe, and real-data visual capture were unavailable in this local run. The release report labels the resulting evidence `STATIC_LAYOUT_PASS` rather than claiming a browser PASS.

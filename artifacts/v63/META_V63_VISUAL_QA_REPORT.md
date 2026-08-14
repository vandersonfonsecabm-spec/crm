# V63 visual QA report

## Authenticated DOM measurements

### 1440 × 900 CSS viewport, selected conversation

- Document: `scrollWidth=1440`, `scrollHeight=900`.
- Toolbar: `x=74, y=60, w=1356, h=48`.
- Workspace: `x=74, y=114, w=1356, h=776`.
- Conversations: `w=338.6`.
- Chat: `w=677.2`.
- Context: `w=338.6`.
- Composer: `y=706.4`, `h=182.8`, bottom `889.2`.

### 1366 × 768 CSS viewport, selected conversation

- Document: `scrollWidth=1366`, `scrollHeight=768`.
- Toolbar: `x=74, y=60, w=1282.4, h=48`.
- Workspace: `x=74, y=114, w=1282.4, h=644`.
- Conversations: `w=320.2`.
- Chat: `w=640.4`.
- Context: `w=320.2`.
- Composer: `y=574.4`, `h=182.8`, bottom `757.2`.

### 390 × 844 CSS viewport

- Document: `scrollWidth=382` (no horizontal overflow); existing mobile vertical scroll model remained available (`scrollHeight=946`).
- Toolbar: `x=12, y=72, w=358.4, h=80`.
- Queue selector: `x=98.85, y=72, w=134.64, h=36`.
- Filters: `x=245.49, y=72, w=80.91, h=36`.
- Existing mobile conversation/drawer and bottom navigation remained intact.

## Screenshots

- `V63_AFTER_1440_QUEUE.jpg`
- `V63_AFTER_1440_SELECTED.jpg`
- `V63_AFTER_1440_FILTERS.jpg`
- `V63_AFTER_1366_SELECTED.jpg`
- `V63_AFTER_390_MOBILE.jpg`

The image files are JPEG captures because the browser capture surface returned JFIF bytes; the filenames and report deliberately reflect the real format. Physical capture dimensions can differ from CSS viewport dimensions due to browser/device scale; the CSS measurements above are the authoritative layout evidence.

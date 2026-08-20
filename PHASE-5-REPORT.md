# گزارش Phase 5 — MIDI Mapping به Keyboard و Puzzle Pieces

## فایل‌های ساخته‌شده

- `src/midi/event-models.ts`
- `src/midi/note-range.ts`
- `src/midi/note-mapper.ts`
- `src/midi/chord-grouper.ts`
- `src/keyboard/key-map-lookup.ts`
- `src/puzzle/puzzle-event-models.ts`
- `src/puzzle/piece-selection.ts`
- `src/puzzle/piece-assignment.ts`
- `PHASE-5-REPORT.md`

## فایل‌های تغییر‌یافته

- `src/core/project/models.ts`
- `src/renderer/app/App.tsx`
- `src/renderer/styles.css`

## مدل‌ها و مسیر Mapping

مسیر اجراشده:

```text
MIDI Note Event
  → Key Map Lookup
  → Homography / Projected Coordinates
  → projectedSpawnPoint
  → Piece Selection
  → PuzzlePieceAssignment
```

`MappedNoteEvent` شامل MIDI note، velocity نرمال‌شده، زمان، key type، مختصات projected، وضعیت و warningها است.

## Key Map Lookup

- MIDI 21 به A0 متصل می‌شود.
- MIDI 60 به C4 متصل می‌شود.
- MIDI 108 به C8 متصل می‌شود.
- کلید سفید/سیاه از Key Map موجود خوانده می‌شود.
- مختصات با Homography فعلی Calibration project می‌شوند.
- Polygon، Bounds، Center، Spawn و Impact Point قابل استفاده هستند.

## Piece Assignment

حالت‌های پشتیبانی‌شده:

- `nearest-centroid`
- `one-note-one-piece`
- `target-region`
- `deterministic-sequence`

حالت پیش‌فرض `nearest-centroid` است. Tie-break به ترتیب distance، priority، layer و id انجام می‌شود تا نتیجه deterministic باشد.

## Chord و زمان

- Chordها با پنجره قابل تنظیم `chordWindowMs` گروه‌بندی می‌شوند.
- مقدار پیش‌فرض 45ms است.
- velocity به مقدار نرمال‌شده منتقل می‌شود.
- startTime و duration از parser موجود به میلی‌ثانیه تبدیل می‌شوند.
- هیچ Animation، Glow، Particle، Audio Sync یا Video Export در این فاز اضافه نشده است.

## Preview و Debug

رابط کاربری اکنون شامل:

- انتخاب MIDI
- انتخاب Mapping Mode
- انتخاب Out-of-range Policy
- تنظیم Chord Window
- اجرای Mapping
- تعداد eventهای mapped/invalid
- تعداد assignmentها و chordها
- نمایش وضعیت هر Note Event و Piece ID مربوطه
- Markerهای Spawn Point در Preview

## مدیریت خطا

خطاهای نبودن MIDI، نبودن Calibration، نبودن Geometry، Homography نامعتبر و Note خارج از محدوده به warning/error ساختاریافته تبدیل می‌شوند و باعث crash نمی‌شوند.

## تست‌ها

- `npm run typecheck` — موفق
- `npm run build` — موفق
- `npm start` — اجرا شد و فرآیند Electron باز ماند؛ timeout ترمینال به‌دلیل GUI بودن برنامه است.

## محدودیت‌های باقی‌مانده

- حالت‌های `target-region` و `deterministic-sequence` فعلاً fallback deterministic به نزدیک‌ترین Piece دارند و سیاست اختصاصی آن‌ها در فاز بعد دقیق‌تر می‌شود.
- Markerها برای Debug هستند و هنوز حرکت یا انیمیشن ندارند.
- Geometry در زمان بارگذاری تصویر به‌صورت Grid ساخته می‌شود؛ انتخاب Geometry Mode مستقل در این فاز UI نشده است.
- Live MIDI Input، Audio Sync، Animation، Effects و Offline Video Render عمداً خارج از Phase 5 باقی مانده‌اند.

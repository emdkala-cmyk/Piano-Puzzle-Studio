# گزارش فاز 4B — Homography و Corner Pin

## پیاده‌سازی

- ماژول مستقل `src/keyboard/homography.ts` برای محاسبه و اعمال ماتریس 3×3 ساخته شد.
- Homography از مستطیل واحد به چهار گوشه مقصد محاسبه می‌شود.
- مختصات کلیدها، برچسب‌ها و Polygonها به‌صورت Perspective-correct project می‌شوند.
- چهار Handle مستقیم روی Preview اضافه شد:
  - topLeft
  - topRight
  - bottomRight
  - bottomLeft
- Drag با Mouse و Pointer Event انجام می‌شود و Overlay به‌صورت زنده به‌روزرسانی می‌شود.
- Quad نامعتبر یا self-intersecting پذیرفته نمی‌شود.
- Homography در Calibration ذخیره می‌شود.
- خروجی SVG و PNG از Polygonهای project‌شده تولید می‌شود.
- Calibrationهای قدیمی بدون Homography همچنان load می‌شوند و ماتریس در زمان رندر محاسبه می‌شود.
- Lock Calibration، Drag را غیرفعال می‌کند.

## تست

- `npm run typecheck` — موفق
- `npm run build` — موفق

## محدودیت

- Homography فعلاً برای چهار گوشه اصلی است و بهینه‌سازی چند Anchor با Least Squares هنوز انجام نشده.
- اتصال Live Camera، MIDI Mapping، انیمیشن، افکت و Export ویدئویی در این فاز انجام نشده است.

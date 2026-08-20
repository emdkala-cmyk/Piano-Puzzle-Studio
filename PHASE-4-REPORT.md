# گزارش فاز چهارم — Reference Overlay و Keyboard Calibration

## قابلیت‌های اضافه‌شده

- مدل TypeScript کامل برای Calibration، Transform، Anchor، PianoKey و Overlay Settings.
- ساخت Layout استاندارد ۸۸ کلید از MIDI 21 تا 108.
- تولید Key Map برای هر کلید با مختصات نرمال‌شده، نوع کلید، نام نت، Spawn Point و Center Point.
- پشتیبانی داده‌ای از View Typeهای `top`، `top-angle`، `three-quarter`، `side` و `custom`.
- رندر Overlay شفاف روی تصویر مرجع در PixiJS.
- کنترل نمایش کلیدهای سفید/سیاه، Label، MIDI Number، Anchor و Wireframe.
- تنظیم Transform شامل Translation، Scale، Rotation، Skew و Perspective.
- پشتیبانی از چهار Corner Pin در مدل و UI.
- تولید خروجی SVG و PNG شفاف.
- ذخیره Calibration در Local Storage با نسخه `1.0.0`.
- Lock Calibration در مدل و رابط کاربری.
- آماده‌سازی Camera Settings و Video Alignment برای فازهای بعدی، بدون اتصال زنده Camera/Video.

## محدودیت‌های فعلی

- محاسبه Perspective فعلاً در مدل و Presetهای View Type نگه‌داری می‌شود و homography کامل در فاز بعد قابل تکمیل است.
- چهار Corner Pin فعلاً به‌صورت مختصات قابل ویرایش در Inspector ارائه شده‌اند و Drag مستقیم روی Canvas هنوز اضافه نشده است.
- Live Camera و Video Frame فقط در مدل داده پیش‌بینی شده‌اند.
- MIDI Mapping، حرکت Puzzle، افکت‌ها و Export ویدئوی نهایی در این فاز پیاده‌سازی نشده‌اند.

## تست

- `npm run typecheck` — موفق
- `npm run build` — موفق

## اجرا

```bash
npm run dev
```

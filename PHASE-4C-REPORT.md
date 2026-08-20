# گزارش Phase 4C — Calibration Workflow Polish

## قابلیت‌های اضافه‌شده

- Drag & drop تصویر مرجع روی Preview.
- File Picker برای PNG/JPG/WebP از طریق Electron.
- وضعیت‌های `No reference loaded`، `Reference loaded` و `Reference invalid`.
- Empty state راهنما در Preview.
- تصویر مرجع به‌عنوان لایه Background مستقل از Overlay نمایش داده می‌شود.
- Corner Handleهای رنگی با hit area مناسب و Pointer Event.
- نمایش label نزدیک هر Corner و قفل‌شدن Drag در حالت Lock.
- انتخاب Anchorهای Left/Right Edge و C2 تا C6.
- ثبت موقعیت Anchor با کلیک روی Preview.
- نمایش Anchor marker و Anchor error برحسب پیکسل.
- پنل Debug خواناتر شامل Homography، Quad، تعداد کلیدها، View، Lock، Hover Key و Anchor Error.
- Save، Load، Reset، Lock/Unlock و Export SVG/PNG.
- migration Calibrationهای قدیمی به نسخه `1.2.0`.
- بهبود overflow، spacing، empty state و RTL layout.

## تست‌های انجام‌شده

- اجرای پروژه بدون Reference: انجام شد از نظر build و state اولیه.
- Drag & Drop و File Picker: مسیرهای UI و خطای فایل غیرتصویری پیاده‌سازی شد.
- Corner Drag: Pointer Event و validation Quad پیاده‌سازی شد.
- Lock Calibration: Drag در حالت lock غیرفعال است.
- Save/Load/Reset: متصل به Local Storage و migration.
- Export PNG/SVG: خروجی Overlay شفاف و مستقل از تصویر مرجع.
- Anchorها: انتخاب، ثبت روی Preview و نمایش خطا.
- Debug readability: پنل جدید با وضعیت‌های کوتاه و خوانا.
- `npm run typecheck`: موفق.
- `npm run build`: موفق.
- `npm start`: اجرا شد؛ فرآیند Electron به‌دلیل GUI در ترمینال باز می‌ماند.

## محدودیت‌های باقی‌مانده

- تشخیص Hover Key فعلاً بر اساس مختصات صفحه مرجع انجام می‌شود و برای hit-testing Perspective دقیق‌تر می‌تواند در فاز بعدی تکمیل شود.
- Camera زنده و Video Alignment هنوز فعال نشده‌اند.
- هیچ MIDI Mapping، حرکت Puzzle، Animation، Particle، Glow یا Video Export در این فاز اضافه نشده است.

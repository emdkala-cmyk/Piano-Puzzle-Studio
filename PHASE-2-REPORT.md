# گزارش فاز دوم — مدل پروژه و بارگذاری واقعی Assetها

## شروع کار

در تاریخ ۲۰ اوت ۲۰۲۶ ساختار اولیه بررسی شد. پروژه فقط UI نمایشی و Preview نمونه داشت و مدل داده، IPC انتخاب فایل و تحلیل MIDI واقعی نداشت.

## تغییرات انجام‌شده

- مدل‌های `Project` و `Asset` با وضعیت‌های `empty/loading/loaded/error` اضافه شد.
- وابستگی `@tonejs/midi` و parser مستقل MIDI اضافه شد.
- سرویس Electron، IPC و Preload برای انتخاب Image/MIDI/Audio اضافه شد.
- Note Event، Tempo Map، Time Signature، Track Summary، Chord Group و آمار MIDI استخراج می‌شوند.
- تصویر واقعی با Data URL در PixiJS نمایش داده می‌شود و نسبت تصویر با contain حفظ می‌شود.
- Timeline به مدت واقعی MIDI، Seek، Play/Pause، Reset، Loop و Marker نت‌ها متصل شد.
- اطلاعات فایل‌ها و وضعیت Assetها در Sidebar نمایش داده می‌شود.

## خارج از محدوده

Puzzle Geometry، افکت‌های واقعی، Export ویدئو، پخش کامل صوت، Randomizer و Preset Engine کامل عمداً پیاده‌سازی نشده‌اند.

## تست‌ها

- `npm run typecheck` — موفق
- `npm run build` — موفق

## دستور اجرای پروژه

```bash
npm run dev
```

## محدودیت‌های باقی‌مانده

- دیالوگ صوتی فقط Asset و Metadata فایل را ثبت می‌کند و پخش کامل صوت هنوز فعال نیست.
- تشخیص ابعاد تصویر در Renderer انجام می‌شود؛ Metadata اولیه IPC برای تصویر عمداً سبک نگه داشته شده است.
- انتخاب Trackها فعلاً از مدل پشتیبانی می‌شود اما UI انتخاب چند Track هنوز اضافه نشده است.
- زمان Time Signature در مدل فعلی بر اساس tick نگه‌داری می‌شود و تبدیل دقیق آن به ثانیه در مرحله بعد تکمیل می‌شود.

# Phase 7 — Visual FX & Particle System

## وضعیت

پیاده‌سازی اولیه و قابل‌اجرا برای Preview زنده تکمیل شد. Phase 8 و Video Export در این مرحله شروع نشده‌اند.

## فایل‌های اضافه‌شده

- `src/fx/fx-types.ts`
- `src/fx/color-palette.ts`
- `src/fx/fx-engine.ts`
- `src/fx/particle-pool.ts`
- `src/fx/glow-controller.ts`
- `src/fx/impact-effect.ts`
- `src/fx/lighting-controller.ts`

## نقاط اتصال

- اتصال FX به Playback Clock و `PuzzleRenderer`
- Note Glow بر اساس Velocity و Pitch
- Motion Trail در زمان حرکت قطعه
- Lock-in Micro Impact و Sparkles
- Bass/High responsive lighting
- توقف و ادامه FX در Pause/Resume
- پاک‌سازی FX در Stop/Reset/Seek
- پنل Visual FX در Inspector با تنظیمات زنده

## محدودیت‌های اجرایی

- Particleها با `PIXI.ParticleContainer` و سقف `1200` شیء فعال مدیریت می‌شوند.
- Artwork palette در این نسخه fallback کنترل‌شده دارد و استخراج رنگ غالب تصویر انجام نمی‌دهد.
- تست GUI با asset واقعی نیازمند بارگذاری دستی Reference Frame، Artwork، MIDI و Calibration است.
- فیلترهای سنگین و Export/FFmpeg عمداً خارج از این فاز هستند.

## Validation

- `npm run typecheck` ✅
- `npm run build` ✅
- هشدار build فقط مربوط به بزرگ‌بودن chunk اصلی Pixi/Renderer است.

## وضعیت Sync و Transform

FX از همان playback time و frameهای Animation استفاده می‌کند و Transform قطعات را تغییر نمی‌دهد. در زمان Lock، Impact روی مختصات target رسم می‌شود و خود قطعه توسط FX reparent یا transform نمی‌شود.

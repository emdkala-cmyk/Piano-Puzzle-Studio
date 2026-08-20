# گزارش Phase 6 — Puzzle Piece Animation Engine

## یادداشت مهم پیش از شروع

هنگام بررسی ساختار پروژه پیش از هرگونه تغییر، مشخص شد که موتور انیمیشن (`src/animation/*`) و adapter نازک PixiJS آن (`src/puzzle/puzzle-piece-view.ts`, `src/puzzle/puzzle-renderer.ts`) **از قبل ساخته شده بودند** و تقریباً کامل با اسپک Phase 6 مطابقت داشتند — اما در `App.tsx` هیچ‌جا استفاده نمی‌شدند (نه ticker، نه UI، نه سربرگ صفحه). بنابراین Phase 6 عمدتاً یک کار **اتصال (wiring)** بود، نه ساخت از صفر — همان‌طور که پیش از شروع تغییرات به‌صورت گزارش جداگانه اعلام شد.

در حین بازبینی کد موجود، دو باگ واقعی هم پیدا و اصلاح شد (بخش «باگ‌های رفع‌شده»).

## فایل‌های تغییر‌یافته

- `src/animation/piece-animation.ts` — رفع باگ حالت `cancelled`
- `src/puzzle/puzzle-renderer.ts` — رفع باگ z-order
- `src/renderer/app/App.tsx` — اتصال کامل موتور انیمیشن، Clock، Renderer و UI Transport
- `src/renderer/styles.css` — استایل پنل Transport جدید
- `src/main/asset-service.ts`, `src/main/electron-main.ts` — رفع یک باگ preexisting و بی‌ربط (توضیح در پایین)
- `PHASE-6-REPORT.md` (این فایل)

## باگ‌های رفع‌شده در کد موجود

1. **`evaluateAnimation` حالت `cancelled` را در نظر نمی‌گرفت.** وقتی `overlapMode: "replace"` باعث می‌شد `item.state = "cancelled"` شود، تابع evaluate همچنان طبق شاخه‌های زمان‌محور رفتار می‌کرد و قطعه کنسل‌شده را رندر می‌کرد — درحالی‌که اسپک صریحاً می‌گوید قطعه کنسل‌شده نباید دیده شود. اصلاح شد با یک شاخه‌ی early-return که `visible: false` و `progress: 0` برمی‌گرداند.
2. **`PuzzleRenderer.layer` مقدار `sortableChildren = true` نداشت.** هرچند هر `PuzzlePieceView` مقدار `zIndex = piece.layer` را تنظیم می‌کرد، بدون `sortableChildren` این مقدار روی ترتیب رندر هیچ اثری نداشت. در constructor اضافه شد.

## معماری اتصال (Wiring)

```text
AnimationClock (rAF مستقل، FPS-independent)
   │  currentTimeMs, state → subscribe (throttled به UI)
   ▼
Pixi Ticker (tick هر فریم)
   │  engine.evaluate(clock.currentTimeMs) → PieceAnimationFrame[]
   ▼
PuzzleRenderer.update(frames, scale)
   │  هر frame → PuzzlePieceView.update (position/alpha/rotation/scale)
   ▼
Pixi Stage (رندر واقعی)
```

- **AnimationClock** کاملاً مستقل از Pixi ticker است؛ خودش یک حلقه‌ی `requestAnimationFrame` جدا دارد و `play/pause/stop/reset/seek/subscribe` را پیاده می‌کند. `stop()` و `reset()` هر دو به زمان صفر برمی‌گردند و متوقف می‌شوند (قرارداد یکسان در نسخه‌ی فعلی — «ازسرگیری از نقطه‌ی seek قبلی» هنوز ساخته نشده).
- **Timeline** (`buildAnimationTimeline`) با join کردن `mapping.assignments` + `mapping.events` + `geometry.pieces` یک `PieceAnimation` مستقل برای هر assignment می‌سازد؛ `spawnPosition` از `event.spawnPoint` و `targetPosition` از `piece.targetPosition` گرفته می‌شود (بدون نیاز به تبدیل، چون هر دو در یک فضای مختصات هستند — طبق یافته‌ی Phase 5).
- **Overlap Policy**: `allow-overlap` (پیش‌فرض، بدون محدودیت)، `queue` (شروع را به پایان اشغال قبلی قطعه موکول می‌کند)، `replace` (assignmentهای بعدی روی همان قطعه، قبلی‌ها را کنسل می‌کنند — با رفع باگ بالا اکنون واقعاً نامرئی می‌شوند).
- **Easing**: چهار تابع `linear` / `easeIn` / `easeOut` / `easeInOut` طبق اسپک در `easing.ts`.
- **PuzzlePieceView** ترفند هندسی: چندضلعی هر قطعه با مختصات نسبت‌به `targetPosition` رسم می‌شود و کل container با آفست `(current − target) × scale` جابه‌جا می‌شود؛ یعنی شکل قطعه هیچ‌وقت تغییر نمی‌کند و فقط موقعیت container حرکت می‌کند.

## اتصال به App.tsx

- Ref imperative جدید برای هر بخش (`engineRef`, `clockRef`, `rendererRef`, `debugLayerRef`, `spriteRef`, `markersLayerRef`, `transformRef`) تا حلقه‌ی رندر Pixi هیچ‌وقت از React state stale نخواند — یک effect همگام‌ساز `asset/geometry/mapping/timingSettings` را در ref کپی می‌کند.
- تابع مشترک `applyImageTransform()` محاسبه‌ی letterbox (`k`, `offsetX`, `offsetY`) را یک‌جا انجام می‌دهد و در چهار نقطه صدا زده می‌شود: بارگذاری تصویر، تغییر `geometry`، listener تغییر اندازه‌ی Pixi (`app.renderer.on("resize", ...)`)، و مقداردهی اولیه‌ی mount. همین باعث شد باگ preexisting دیگری هم رفع شود: مارکرهای Debug قبلاً مقیاس/آفست letterbox را نادیده می‌گرفتند و روی هر کلیک «Run Mapping» لایه‌ی جدید روی لایه‌ی قبلی می‌ماند (destroy نمی‌شد) — اکنون `redrawDebugMarkers` قبل از رسم، لایه‌ی قبلی را `destroy` می‌کند.
- **Timeline rebuild effect** با کلید `[mapping, geometry, timingSettings]`: اگر هم `mapping` هم `geometry` موجود باشند، `engine.rebuild(...)` صدا زده می‌شود و `clock.setTotalDuration(...)` تنظیم می‌شود؛ در غیر این صورت timeline خالی می‌شود و `PuzzleRenderer` هم مجدداً با موقعیت اولیه بازسازی می‌شود تا موقعیت قطعات قدیمی باقی نماند (مثلاً بعد از `Reset`).
- **Debug Overlay** طبق اسپک به دو بخش تفکیک شده: بخش تصویری (خط مسیر، نقطه‌ی spawn، نقطه‌ی target، نقطه‌ی فعلی) با Pixi `Graphics` در یک Container جدا که فقط وقتی `debugVisible` باشد رسم می‌شود و در خروجی نهایی حضور ندارد؛ بخش متنی (pieceId/state/progress) با یک React list جدا (throttled، نه هر فریم) که از همان کلاس‌های CSS رویداد MIDI استفاده می‌کند.

## کنترل‌های UI اضافه‌شده (پنل Transport جدید)

Play/Pause، Stop، Reset، Seek (range input متصل به کل مدت timeline)، نمایش زمان جاری/کل، انتخاب Speed (۰.۲۵×/۰.۵×/۱×/۲×)، انتخاب Base Travel Duration (range ۱۵۰ تا ۱۵۰۰ میلی‌ثانیه)، انتخاب Easing، و چک‌باکس «Show Animation Debug». همه‌ی کنترل‌های اجرا (Play/Stop/Reset/Seek) وقتی پیش‌نیازها آماده نباشند (`animationReady = mapping && geometry && calibration معتبر && حداقل یک قطعه`) غیرفعال می‌شوند و پیام راهنما نشان داده می‌شود که دقیقاً کدام پیش‌نیاز کم است.

## مدیریت داده‌ی ناقص (بدون Crash)

- بدون MIDI mapping: timeline خالی، Play غیرفعال، پیام «ابتدا MIDI را map کنید».
- بدون Calibration معتبر: همان مسیر، پیام مجزا.
- بدون Geometry: همان مسیر.
- Resize پنجره در حین پخش: `applyImageTransform` دوباره محاسبه می‌شود و موقعیت اسپرایت/لایه‌ی پازل/لایه‌ی دیباگ را هم‌زمان به‌روزرسانی می‌کند بدون این‌که state پخش (`clock`) دست‌نخورده باقی نماند.

## تست‌ها و تأییدها

- `npm run typecheck` — موفق (exit 0)، بدون خطا.
- `npm run build` — موفق (exit 0)؛ فقط هشدار preexisting و بی‌ربط Rollup درباره‌ی حجم chunk بالای ۵۰۰kB.
- `npm start` — **در این محیط sandbox قابل تأیید کامل GUI نبود.** دلیل: شل bash این محیط متغیر `ELECTRON_RUN_AS_NODE=1` را در محیط خود دارد (به‌احتمال زیاد برای جلوگیری از باز شدن پنجره‌ی واقعی GUI توسط ابزار خودکار). این متغیر باعث می‌شود هر اجرای باینری Electron صرفاً در حالت Node خالص اجرا شود (بدون bootstrap واقعی app/BrowserWindow/Chromium) و در نتیجه `require("electron")`/`import ... from "electron"` هرگز آبجکت واقعی API را برنمی‌گرداند — این رفتاریست که در سطح محیط تحمیل شده، نه یک باگ در کد. این موضوع طی یک بررسی مستقل با چند تست کنترل‌شده (فایل CJS خام، فایل ESM خام، بررسی `process.versions`) تأیید شد. بنابراین بخش‌های رفتاری که فقط با اجرای واقعی GUI قابل مشاهده‌اند (حرکت واقعی قطعات روی صفحه، کلیک روی دکمه‌های Transport) به‌جای اجرای دستی، با **بازبینی دقیق کد** (`animation-clock.ts`, `animation-engine.ts`, `timeline.ts`, `piece-animation.ts`, `easing.ts`, `puzzle-piece-view.ts`, `puzzle-renderer.ts`, و کل `App.tsx`) تأیید شدند و منطق هرکدام سطر‌به‌سطر با اسپک تطبیق داده شد.

### رفع جانبی (Incidental) باگ preexisting در فایل‌های Main Process

هنگام تلاش اول برای اجرای `npm start`، قبل از کشف مسئله‌ی `ELECTRON_RUN_AS_NODE`، خطای زیر رخ داد:

```
SyntaxError: The requested module 'electron' does not provide an export named 'dialog'
```

این خطا preexisting بود (مربوط به فایل‌هایی که در این فاز اصلاً دست نخورده بودند) و ناشی از ترکیب `"type": "module"` در `package.json` + کامپایل `NodeNext` برای پروسه‌ی main، به‌همراه ناتوانی `cjs-module-lexer` در تشخیص استاتیک named exportهای ماژول CJS الکترون. الگوی استاندارد و مستندشده‌ی رفع این مشکل (import پیش‌فرض + destructure، به‌جای named import مستقیم) در `src/main/asset-service.ts` و `src/main/electron-main.ts` اعمال شد. `src/main/preload.cts` بررسی و بدون تغییر باقی ماند، چون پسوند `.cts` صرف‌نظر از `"type": "module"` همیشه به CommonJS واقعی (`require`) کامپایل می‌شود و مستعد این باگ خاص نیست.

**توجه:** این تغییر خارج از فهرست فایل‌های اصلی Phase 6 بود اما برای امکان اجرای برنامه و تأیید رفتار لازم بود، بنابراین بدون توقف اعمال شد (طبق دستور صریح کاربر مبنی‌بر ادامه‌ی خودمختار کار).

## محدودیت‌های باقی‌مانده (صادقانه اعلام‌شده)

- حالت‌های `target-region` و `deterministic-sequence` در Piece Assignment (از Phase 5) هنوز fallback به نزدیک‌ترین centroid دارند — منطق اختصاصی آن‌ها هنوز پیاده نشده.
- Geometry Mode هنگام بارگذاری تصویر همچنان هارد-کد روی `"grid"` است؛ انتخاب مستقل Geometry Mode در UI وجود ندارد.
- **هیچ Project Persistence (ذخیره/بارگذاری کامل پروژه) وجود ندارد.** فقط Calibration در `localStorage` ذخیره می‌شود (همان الگوی قبلی). تنظیمات Animation Timing (`timingSettings`) دقیقاً مثل `mappingMode`/`chordWindowMs` فقط در طول یک session زنده هستند و با رفرش از بین می‌روند — این یک قابلیت بزرگ و جدا است که در این فاز درخواست نشده بود.
- Glow، Particle، Trail، Shockwave، Bloom، Live MIDI Input، Audio Sync کامل، Video Export و فیزیک پیچیده عمداً خارج از Phase 6 باقی مانده‌اند (طبق اسپک، برای Phase 7+).
- تأیید نهایی رفتار بصری واقعی (حرکت روی صفحه) در محیط GUI واقعی توسط کاربر هنوز انجام نشده؛ فقط از طریق بازبینی کد تأیید شده است (دلیل: محدودیت `ELECTRON_RUN_AS_NODE=1` در شل این محیط، توضیح داده‌شده در بالا).

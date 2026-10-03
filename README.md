# Online Coaching Website

موقع عربي متجاوب للأونلاين كوتشينج مع لوحة إدارة تعمل داخل المتصفح.

## التشغيل

افتح `index.html` مباشرة، أو شغّل خادمًا محليًا داخل المجلد:

```powershell
python -m http.server 8080
```

ثم افتح `http://localhost:8080`.

## لوحة الإدارة

اضغط "الإدارة" في القائمة أو افتح `index.html#admin`. يمكنك تعديل النصوص، الباقات، الأسعار، التحولات، الآراء والأسئلة ورفع الصور. البيانات محفوظة حاليًا في `localStorage` في نفس المتصفح.

> للنشر الحقيقي متعدد الأجهزة وتسجيل دخول آمن، اربط الواجهة بقاعدة بيانات وخدمة ملفات مثل Supabase أو Firebase. النسخة الحالية مناسبة للمعاينة وإدارة المحتوى على جهاز واحد.
# Online Coaching Platform

## التشغيل

```powershell
$env:ADMIN_PASSWORD="ضع-كلمة-مرور-قوية"
node server.js
```

كلمة المرور الافتراضية للإدارة هي `Hashem_2005`. يفضل تغييرها في الاستضافة عبر متغير البيئة `ADMIN_PASSWORD`.

يفتح الموقع على `http://localhost:8080`. لوحة الإدارة من `/#admin`، الخطط من
`/planner.html`، ولوحة متابعة العملاء من `/dashboard.html`.

## التخزين

- `coaching.db`: المحتوى والخطط والعملاء وجلسات التمرين.
- `uploads/`: الصور المضغوطة المرفوعة من الإدارة.
- `backups/`: نسخة تلقائية من قاعدة البيانات قبل حفظ محتوى الموقع.
- عند أول دخول للإدارة، ينتقل محتوى `localStorage` القديم إلى SQLite تلقائيًا إذا
  لم يكن هناك محتوى محفوظ على السيرفر.

يمكن ضبط `ADMIN_PASSWORD` كمتغير بيئة سري في الاستضافة بدل القيمة الافتراضية.

## أهم الواجهات

- `GET /api/content`
- `GET/PUT /api/admin/content`
- `POST /api/admin/uploads`
- `GET /api/admin/dashboard`
- `POST /api/client/sessions`
- `PATCH /api/client/sessions/:id`

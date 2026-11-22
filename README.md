# تطبيق د. وائل لسطح المكتب (Windows / macOS / Linux)

تطبيق Electron لمنصة د. وائل التعليمية. يحافظ هذا التحديث على عنوان التخزين المحلي ومفاتيح الملاحظات الموجودة، ويضيف أدوات مذاكرة وحماية لنسخة سطح المكتب.

## الجديد في هذا التحديث

- مؤقت تركيز لمدة 25 أو 50 دقيقة، مع الإيقاف المؤقت والاستكمال وسجل محلي لكل حساب. يستعيد الموعد عند العودة للتطبيق، لكنه لا يصدر تنبيهًا والتطبيق مغلق. الجلسات ليست إثباتًا لوقت مذاكرة فعلي ولا تُضاف إلى دقائق مشاهدة المحاضرات.
- تصدير جدول الامتحانات إلى ملف تقويم `.ics` يستورده الطالب بنفسه. المواعيد أحداث يوم كامل، بلا تنبيهات أو دعوات أو إضافة تلقائية إلى حساب تقويم.
- تقييد رسائل الوظائف الأصلية بالنافذة والإطار الرئيسيين للتطبيق، ورفض أذونات الكاميرا والميكروفون والموقع وقراءة الحافظة والأذونات غير المسموح بها.
- تقييد خادم التطبيق بالواجهة المحلية، والتحقق من عنوان Host، ومنع تضمين صفحة التطبيق داخل إطار في موقع آخر.

هذه تغييرات محددة مع اختبارات، وليست ضمانًا بأن التطبيق خالٍ من الثغرات.

## تحديثات Microsoft Store الإلزامية

ينطبق حاجز بدء التشغيل على نسخة Windows المبنية للمتجر:

1. تظهر نافذة تحقق منفصلة قبل تشغيل المنصة وخادمها المحلي والـ Tray.
2. يستعلم مساعد Windows أصلي من واجهة Microsoft Store عن تحديث الحزمة الأساسية، ويتحقق من هوية الحزمة وإصدارها.
3. عند اكتشاف تحديث، يظل فتح المنصة محظورًا حتى تثبيته من المتجر. فتح المتجر ينهي التطبيق بالكامل حتى يستطيع المتجر استبداله.
4. غياب الإنترنت أو فشل الفحص يمنع الدخول أيضًا. هذا سلوك مقصود، حتى لو كانت هناك ملفات سبق تنزيلها على الجهاز، ولا يحذف تلك الملفات أو الملاحظات.
5. يتذكر التطبيق أن الإصدار المثبت يحتاج تحديثًا، فلا يتيح تجاوزه بإعادة التشغيل أو قطع الاتصال.

قد تتأخر واجهة المتجر في إظهار إصدار منشور بسبب ذاكرة Microsoft المؤقتة وتوفر الإصدار للحساب والجهاز. لا يتحول إصدار قديم سبق تثبيته إلى هذا السلوك بأثر رجعي، بل يجب تثبيت النسخة الجديدة مرة أولى.

اختبارات المصدر ومساعد Windows واختبار Electron غير المثبت من المتجر لا تثبت دورة التحديث الحقيقية. يلزم اختبار نسخة موزعة من المتجر على Windows: إصدار حالي، تحديث متاح، منع الدخول، تثبيت التحديث، ثم إعادة الفتح. تظل هذه تجربة قبول منفصلة لم تُثبت بعد، ونشر الحزمة لا يُعد دليلًا على أنها تمت.

لا تفحص نسخة سطح المكتب إصدارات GitHub ولا تنزّل تحديثات منها داخل التطبيق. زر التحديث يفتح Microsoft Store، ولا يدّعي أن الإصدار هو الأحدث دون تحقق. يبقى GitHub لحفظ المصدر وتوزيع مثبّتات Windows وmacOS وLinux. لإصدارات GitHub والمتجر عدّادا بناء مستقلان.

## البيانات والتوافق

- عنوان صفحة التطبيق يبقى `http://localhost:47831` ما دام المنفذ متاحًا، للحفاظ على التخزين المحلي السابق. لا يغيّر التحديث مفاتيح الملاحظات أو يحذف بيانات الطلاب.
- بيانات التركيز الجديدة محلية ومفصولة حسب الحساب. ملف التقويم لا يُرسل إلى خدمة تقويم تلقائيًا.
- ترقية Electron إلى `45.4.1` وأداة البناء إلى `26.18.0` تخص بناء Windows Store فقط. إعدادات إصدارات macOS وLinux الحالية لم تُرفع ضمنيًا.
- منع تصوير المحتوى يعتمد على نظام التشغيل، وليس حماية مطلقة. `setContentProtection` لا يوفر الحماية نفسها على Linux.
- إغلاق النافذة الرئيسية يخفيها في Tray، والخروج الكامل من قائمته. نافذة التحديث الإلزامي مختلفة: إغلاقها ينهي التشغيل ولا يفتح المنصة.
- مُثبّت Windows على GitHub غير موقّع رقميًا وقد يعرض SmartScreen. لا تعطّل حماية Windows لتشغيله. اعتماد وتوقيع Microsoft Store مسار منفصل.

## التطوير والاختبار

```sh
npm install
npm run lint
node --test tests/*.test.js
```

تشغيل الويب المحلي: `npm start`. تشغيل Electron بعد تثبيت تبعيات سطح المكتب: `npm run electron:start`.

يبني `.github/workflows/store-build.yml` حزمة APPX، ويشغّل اختبارات المصدر، ويجمع المساعد الأصلي عبر C++/WinRT. لا يرفع الحزمة إلى Partner Center تلقائيًا. يحدد `STORE_BUILD_NUMBER` رقم الحزمة عند الحاجة، وإلا يُستخدم رقم تشغيل البناء. إعداد `build/store-gate.json` يقبل سياسة `block` فقط.

لبناء المساعد محليًا يلزم Windows وVisual Studio C++ Build Tools وWindows SDK. ملف `tests/electron-store-gate-smoke.cjs` اختبار سلبي باستخدام Electron حقيقي ومساعد حقيقي خارج حزمة المتجر، وليس بديلًا عن اختبار Microsoft Store المثبت.

يبني `.github/workflows/build.yml` مثبّتات الأنظمة الثلاثة وينشر إصدار GitHub عند دفع تغييرات إلى الفرع الرئيسي. استخدم فرعًا مرشحًا أو `[skip ci]` عند الحاجة إلى إعداد المصدر دون نشر مثبّتات. يحتوي `npm run desktop:zip` على مصدر المشروع اللازم لإعادة البناء.

## تسجيل الدخول والإعدادات

يفتح تسجيل الدخول بجوجل المتصفح الافتراضي ثم يعيد الجلسة إلى التطبيق. في Firebase Authentication، يجب أن يكون `localhost` ضمن النطاقات المسموح بها. إعدادات عميل Firebase ليست كلمات مرور أو مفاتيح خادم سرية. لا تضع أسرار الخادم في `config.json` أو حزمة التطبيق.


## Windows verification and release requirements

- Windows10 version1903 or later, with Windows Hello configured, is required for the new Windows entry gate. Unsupported or unconfigured devices cannot open the app without verification. The app never receives or saves the Windows PIN.
- Verification is required at startup, after Windows lock/sleep, and before payment submission. A changed account or payment context invalidates a pending confirmation.
- The existing Microsoft Store update check remains first. Store update errors and offline checks still block entry under the selected policy.
- The account-wide six-calendar-month Pro offer starts only when the new Microsoft Store update is available for download, not when a GitHub build or Store submission is created. Its start/end come from server policy. Paid courses are excluded, and longer applicable existing grants are preserved.
- Missing or unverified promotion policy pauses new Pro purchases. It does not erase saved themes, notes, balances, purchases or permanent access.
- macOS payment verification continues to use Touch ID. Unsupported Linux payment verification fails closed. The mandatory Windows Hello gate is Windows-specific.

Local validation includes unit/security tests, source checks and a sandboxed Electron gate smoke with a synthetic verifier. A synthetic verifier is not a real Windows Hello or Store-installed upgrade test. Those acceptance checks still need a supported Windows device.

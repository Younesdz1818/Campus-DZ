Campus DZ - Firebase Verification v2.0

هذا مجلد جاهز لرفع ملفاته إلى مستودع GitHub الحالي.
استبدل الملفات القديمة بالملفات الموجودة هنا مع الحفاظ على المسارات:
- CampusDZ_Digital_Student_Card_v1.5.zip
- google-services.json
- .github/workflows/build-apk.yml
وأضف:
- firestore.rules
- storage.rules

بعد الرفع:
1. انشر قواعد Firestore من firestore.rules.
2. انشر قواعد Storage من storage.rules.
3. فعّل Email/Password في Firebase Authentication.
4. أنشئ حساب المدير وأضف له Custom Claim باسم admin=true عبر Firebase Admin SDK.
5. شغّل GitHub Actions > Build Campus DZ APK، ثم نزّل Artifact Campus-DZ-APK.

راجع README_AR.txt داخل المشروع للتفاصيل الأمنية والإعدادات.
مهم: لم يتم بناء APK هنا؛ يجب تشغيل GitHub Actions بعد ضبط Firebase والتحقق من نجاح البناء.

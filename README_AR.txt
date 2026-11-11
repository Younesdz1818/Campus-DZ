Campus DZ - الإصدار 2.0 (Firebase Student Verification)

ما تم إضافته:
- تسجيل حساب الطالب باستخدام رقم جامعي من 16 رقمًا وكلمة مرور.
- رفع صورة الوجه الأمامي للبطاقة، والخلفي اختياري.
- تخزين الصور في Firebase Storage تحت studentCards/{uid}/ بشكل خاص.
- حفظ طلب التحقق في Firestore بحالة pending.
- منع الدخول إلى التطبيق قبل موافقة المدير.
- لوحة مدير تعرض الطلبات وتسمح بالقبول والرفض والإيقاف.
- إمكانية حذف صور البطاقة من لوحة المدير بعد انتهاء المراجعة.
- استخدام Firebase Custom Claims بصلاحية admin لحماية لوحة المدير والبيانات.

إعداد Firebase المطلوب قبل التشغيل:
1) افتح Firebase Console للمشروع campus-dz-d2a18.
2) من Authentication > Sign-in method فعّل Email/Password.
3) تأكد من إنشاء Firestore Database وStorage.
4) انشر قواعد firestore.rules في Firestore Rules.
5) انشر قواعد storage.rules في Storage Rules.
6) ملف app/google-services.json مرفق ومطابق للحزمة dz.campus.app.

طريقة إنشاء حساب المدير:
- أنشئ مستخدمًا في Firebase Authentication باستخدام بريد على النمط:
  رقم_جامعي_من_16_رقمًا@campusdz.app
  وكلمة مرور قوية.
- امنح UID لهذا المستخدم Custom Claim باسم admin وقيمته true باستخدام Firebase Admin SDK من بيئة موثوقة وآمنة (لا تضع مفتاح الخدمة داخل التطبيق).
- مثال Node.js يُشغّل محليًا على جهاز المسؤول بعد تهيئة Admin SDK:

  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  await admin.auth().setCustomUserClaims('ADMIN_USER_UID', { admin: true });

- استبدل ADMIN_USER_UID بالـ UID الحقيقي. سجّل الخروج ثم الدخول مجددًا حتى تُحدّث مطالبة الصلاحية.
- لا تجعل صلاحية المدير حقلًا يكتبه المستخدم في Firestore؛ يجب أن تكون Custom Claim فقط.

ملاحظات مهمة:
- التطبيق لا يتحقق من قاعدة بيانات الجامعة الرسمية؛ الرقم الجامعي يُفحص شكليًا (16 رقمًا) ثم يراجعه المدير عبر البطاقة.
- يُنشأ حساب Firebase Auth ببريد داخلي اصطناعي بالشكل {studentNumber}@campusdz.app؛ لا تُرسل رسائل بريد ولا يوجد تحقق من البريد.
- يجب إبلاغ الطالب بسياسة الخصوصية ومدة الاحتفاظ بصور البطاقة قبل التسجيل. يستطيع المدير حذف الصور بعد المراجعة من لوحة التحكم.
- لا ترفع بيانات طلاب حقيقية للاختبار قبل نشر القواعد واختبارها بحسابات تجريبية.

البناء:
- افتح مجلد CampusDZ_Android في Android Studio.
- نفّذ Sync Project with Gradle Files ثم Build > Build APK(s).
- يتطلب اتصال إنترنت لتحميل مكتبات Firebase.

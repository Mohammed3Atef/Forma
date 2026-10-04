/**
 * Forma's legal pages — the real copy that replaces the design's placeholder
 * outline (design/legal.ts keeps the generated structure). Written from what
 * the product actually does (audited in code, 2026-10-04) and Egypt's Personal
 * Data Protection Law No. 151 of 2020 + its 2025 Executive Regulations.
 * Strings are trusted static HTML (only <a>/<b> are used).
 *
 * Keep in sync with the product: if a processor, cookie, retention rule or a
 * commercial default changes, update the matching section and LEGAL_UPDATED.
 */
export type LegalDocKey = 'terms' | 'privacy' | 'cookies';

export type LegalBlock = string | { ul: string[] } | { table: string[][] };
export interface LegalSection {
  h: [string, string];
  b: [LegalBlock[], LegalBlock[]];
}
export interface LegalPage {
  t: [string, string];
  s: LegalSection[];
}

export const LEGAL_UPDATED: [string, string] = ['4 October 2026', '٤ أكتوبر ٢٠٢٦'];

const EMAIL = 'useformafitness@gmail.com';
const MAIL = `<a href="mailto:${EMAIL}" dir="ltr">${EMAIL}</a>`;
const WA = '<a href="https://wa.me/201553320453" target="_blank" rel="noopener" dir="ltr">+20 155 332 0453</a>';
const PRIVACY = (t: string) => `<a href="/privacy">${t}</a>`;
const COOKIES = (t: string) => `<a href="/cookies">${t}</a>`;

const TERMS: LegalPage = {
  t: ['Terms of Service', 'شروط الخدمة'],
  s: [
    {
      h: ['About these terms', 'عن هذه الشروط'],
      b: [
        [
          'These Terms of Service (“Terms”) govern your use of Forma — the website at useforma.fit, the Forma web and installable app, and related services (together, the “Service”). Forma is operated from the Arab Republic of Egypt (“Forma”, “we”, “us”).',
          `By creating an account, accepting an invitation or otherwise using the Service, you agree to these Terms and to our ${PRIVACY('Privacy Policy')}. If you do not agree, please do not use the Service.`,
          'We may update these Terms from time to time. If a change is material, we will tell you in the app or by email at least 14 days before it takes effect. Continuing to use the Service after that date means you accept the updated Terms.',
        ],
        [
          'تنظّم شروط الخدمة هذه («الشروط») استخدامك لفورما — الموقع الإلكتروني useforma.fit وتطبيق فورما على الويب والقابل للتثبيت والخدمات المرتبطة بهما (ويُشار إليها مجتمعة بـ«الخدمة»). تُدار فورما من جمهورية مصر العربية («فورما» أو «نحن»).',
          `بإنشائك حسابًا أو قبولك دعوة أو استخدامك للخدمة بأي شكل، فإنك توافق على هذه الشروط وعلى ${PRIVACY('سياسة الخصوصية')}. إذا لم توافق، يُرجى عدم استخدام الخدمة.`,
          'قد نحدّث هذه الشروط من وقت لآخر. إذا كان التغيير جوهريًا فسنُبلغك داخل التطبيق أو عبر البريد الإلكتروني قبل سريانه بـ14 يومًا على الأقل، واستمرارك في استخدام الخدمة بعد ذلك يعني قبولك للشروط المحدّثة.',
        ],
      ],
    },
    {
      h: ['Accounts & roles', 'الحسابات والأدوار'],
      b: [
        [
          {
            ul: [
              '<b>Coaches</b> sign up directly and use Forma to manage their clients, programmes and business.',
              '<b>Clients</b> join through an invitation from their coach and use Forma to follow their plan, log progress and talk to their coach.',
              '<b>Administrators</b> are Forma staff who operate, support and secure the platform.',
            ],
          },
          'You must be at least 18 years old to create a coach account. A client under 18 may use Forma only with the consent and supervision of a parent or legal guardian; a coach who invites a minor is responsible for obtaining that consent.',
          'Give accurate information and keep it up to date. Keep your password confidential — you are responsible for activity under your account — and tell us promptly if you suspect unauthorised access.',
          'Coaches are responsible for the clients they invite: for having their agreement to be coached and to have their information recorded in Forma, and for the fees and terms they agree with each client. Forma is not a party to the arrangement between a coach and a client, and coaching fees are paid to the coach directly, not to Forma.',
        ],
        [
          {
            ul: [
              '<b>المدربون</b> يسجّلون مباشرة ويستخدمون فورما لإدارة عملائهم وبرامجهم وأعمالهم.',
              '<b>العملاء</b> ينضمون بدعوة من مدربهم ويستخدمون فورما لمتابعة خطتهم وتسجيل تقدّمهم والتواصل مع المدرب.',
              '<b>المسؤولون</b> هم فريق فورما الذي يشغّل المنصة ويدعمها ويؤمّنها.',
            ],
          },
          'يجب ألا يقل عمرك عن 18 عامًا لإنشاء حساب مدرب. ولا يجوز لعميل دون 18 عامًا استخدام فورما إلا بموافقة وإشراف أحد الوالدين أو الولي القانوني، ويتحمّل المدرب الذي يدعو قاصرًا مسؤولية الحصول على هذه الموافقة.',
          'قدّم معلومات صحيحة وحافظ على تحديثها، واحتفظ بكلمة المرور سرّية — فأنت مسؤول عن أي نشاط يتم عبر حسابك — وأبلغنا فورًا إذا اشتبهت في أي دخول غير مصرّح به.',
          'المدرب مسؤول عن العملاء الذين يدعوهم: عن الحصول على موافقتهم على التدريب وعلى تسجيل بياناتهم في فورما، وعن الرسوم والشروط التي يتفق عليها مع كل عميل. فورما ليست طرفًا في الاتفاق بين المدرب والعميل، ورسوم التدريب تُدفع للمدرب مباشرة وليس لفورما.',
        ],
      ],
    },
    {
      h: ['Free trial & subscription', 'التجربة المجانية والاشتراك'],
      b: [
        [
          'Every new coach account starts with a free trial. The trial length and client limit are shown on our pricing page when you sign up (currently 15 days). No payment details are needed to start.',
          'After the trial, the Forma subscription is a monthly plan paid in advance at the price shown on our pricing page (currently 499 EGP per month, including up to 25 active clients). Extra client capacity is available as add-on packages.',
          {
            ul: [
              'Payment is arranged directly with Forma; a subscription term starts once we confirm your payment.',
              'Renewals are never charged automatically — you renew each term by requesting it in the app and paying. If you renew early, the new term starts when the current one ends, so you never lose paid days.',
              'If your trial or subscription ends without renewal, your account and data stay in place. You can still view your clients and message them, but you cannot add clients or edit plans until you renew.',
              'We will announce price changes at least 30 days in advance. A change never affects a term you have already paid for.',
            ],
          },
          'You can stop renewing at any time; access continues until the end of the term you paid for. Fees for a term that has already started are non-refundable, except where the law requires otherwise or where we cannot provide the Service because of our own fault — in that case we refund the unused part of the term.',
        ],
        [
          'يبدأ كل حساب مدرب جديد بتجربة مجانية، وتظهر مدتها وحدّ العملاء فيها على صفحة الأسعار عند التسجيل (حاليًا 15 يومًا)، دون الحاجة إلى أي بيانات دفع.',
          'بعد انتهاء التجربة يكون اشتراك فورما خطة شهرية تُدفع مقدّمًا بالسعر المعروض على صفحة الأسعار (حاليًا 499 جنيهًا مصريًا شهريًا، وتشمل حتى 25 عميلًا نشطًا). وتتوفر سعة إضافية للعملاء في صورة باقات إضافية.',
          {
            ul: [
              'يتم ترتيب الدفع مباشرة مع فورما، وتبدأ مدة الاشتراك بمجرد تأكيدنا لاستلام الدفع.',
              'لا يتم تجديد الاشتراك أو تحصيله تلقائيًا أبدًا — تجدّد كل مدة بطلبها من داخل التطبيق ثم الدفع. وإذا جدّدت مبكرًا تبدأ المدة الجديدة عند انتهاء الحالية، فلا تخسر أي أيام مدفوعة.',
              'إذا انتهت التجربة أو الاشتراك دون تجديد يظل حسابك وبياناتك كما هي، ويمكنك الاطلاع على عملائك ومراسلتهم، لكن لا يمكنك إضافة عملاء أو تعديل الخطط حتى تجدّد.',
              'سنعلن عن أي تغيير في الأسعار قبل 30 يومًا على الأقل، ولا يؤثر التغيير على مدة سبق أن دفعت مقابلها.',
            ],
          },
          'يمكنك التوقف عن التجديد في أي وقت، ويستمر وصولك حتى نهاية المدة المدفوعة. الرسوم عن مدة بدأت بالفعل غير قابلة للاسترداد، إلا إذا اقتضى القانون غير ذلك أو تعذّر علينا تقديم الخدمة بسبب خطأ من جانبنا، وفي هذه الحالة نردّ قيمة الجزء غير المستخدم من المدة.',
        ],
      ],
    },
    {
      h: ['Coach-led service', 'خدمة بقيادة المدرب'],
      b: [
        [
          'Forma is software that helps coaches organise their work. Every training programme, nutrition plan, target, piece of feedback and other guidance in Forma is created by a coach, and the coach is solely responsible for it.',
          'Forma does not provide medical, dietary or health advice and is not a substitute for a doctor or other qualified health professional. Clients should consult a qualified professional before starting a new exercise or nutrition programme — especially with an injury, a medical condition or during pregnancy — and should stop and seek medical help if they feel pain, dizziness or shortness of breath.',
          'Coaches confirm that they hold any qualifications or licences the law requires for the services they offer.',
        ],
        [
          'فورما برنامج يساعد المدربين على تنظيم عملهم. كل برنامج تدريبي أو خطة تغذية أو هدف أو ملاحظة أو توجيه داخل فورما يضعه المدرب، والمدرب وحده مسؤول عنه.',
          'لا تقدّم فورما أي نصيحة طبية أو غذائية أو صحية، وليست بديلًا عن الطبيب أو أي مختص صحي مؤهل. على العميل استشارة مختص مؤهل قبل البدء في أي برنامج تمارين أو تغذية جديد — خاصة في حالة الإصابة أو وجود حالة صحية أو أثناء الحمل — والتوقف وطلب المساعدة الطبية عند الشعور بألم أو دوخة أو ضيق في التنفس.',
          'يقرّ المدرب بأنه يحمل أي مؤهلات أو تراخيص يشترطها القانون للخدمات التي يقدّمها.',
        ],
      ],
    },
    {
      h: ['Your content', 'المحتوى الخاص بك'],
      b: [
        [
          'You keep ownership of the content you add to Forma — plans, logs, notes, photos, videos, voice notes and messages.',
          `You give Forma a limited, non-exclusive, royalty-free licence to host, store, copy, process and display that content only as needed to operate, secure and improve the Service, and as described in our ${PRIVACY('Privacy Policy')}. The licence ends when the content is deleted, apart from copies we must keep by law or that remain for a short time in backups.`,
          'You confirm that you have the right to upload your content, including the permission of anyone who appears in your photos or videos.',
          'The Forma software, design, brand and built-in exercise library belong to Forma or its licensors.',
        ],
        [
          'يظل المحتوى الذي تضيفه إلى فورما ملكًا لك — الخطط والسجلات والملاحظات والصور والفيديوهات والرسائل الصوتية والرسائل.',
          `تمنح فورما ترخيصًا محدودًا وغير حصري وبدون مقابل لاستضافة هذا المحتوى وتخزينه ونسخه ومعالجته وعرضه، فقط بالقدر اللازم لتشغيل الخدمة وتأمينها وتحسينها وكما هو موضّح في ${PRIVACY('سياسة الخصوصية')}. وينتهي الترخيص بحذف المحتوى، باستثناء النسخ التي يُلزمنا القانون بالاحتفاظ بها أو التي تبقى لفترة قصيرة في النسخ الاحتياطية.`,
          'تقرّ بأن لديك الحق في رفع المحتوى، بما في ذلك إذن أي شخص يظهر في الصور أو الفيديوهات.',
          'برنامج فورما وتصميمها وعلامتها التجارية ومكتبة التمارين المدمجة مملوكة لفورما أو للجهات المرخِّصة لها.',
        ],
      ],
    },
    {
      h: ['Acceptable use', 'الاستخدام المقبول'],
      b: [
        [
          'When using Forma you must not:',
          {
            ul: [
              'break the law, or upload content that is unlawful, abusive, harassing, hateful or sexually explicit;',
              'upload content you do not have the right to share, or images of other people without their permission;',
              'impersonate anyone, or access another person’s account or data without authorisation;',
              'attack, probe, overload, scrape, reverse-engineer or interfere with the Service or its security;',
              'resell or sublicense the Service without our written permission;',
              'promote dangerous practices, such as extreme dieting or the use of prohibited substances.',
            ],
          },
          'We may suspend or close an account that breaches these Terms or puts others at risk, giving notice where reasonable. You can stop using Forma at any time and ask us to delete your account.',
        ],
        [
          'عند استخدام فورما لا يجوز لك:',
          {
            ul: [
              'مخالفة القانون، أو رفع محتوى غير قانوني أو مسيء أو فيه تحرّش أو كراهية أو محتوى جنسي صريح؛',
              'رفع محتوى ليس لديك حق مشاركته، أو صور لأشخاص آخرين دون إذنهم؛',
              'انتحال شخصية أي شخص، أو الدخول إلى حساب أو بيانات شخص آخر دون تصريح؛',
              'مهاجمة الخدمة أو فحصها أو إغراقها بالطلبات أو استخراج بياناتها آليًا أو الهندسة العكسية لها أو التدخل في أمانها؛',
              'إعادة بيع الخدمة أو منح ترخيص من الباطن لها دون إذن كتابي منا؛',
              'الترويج لممارسات خطرة مثل الحميات المفرطة أو استخدام المواد المحظورة.',
            ],
          },
          'يجوز لنا إيقاف أو إغلاق أي حساب يخالف هذه الشروط أو يعرّض الآخرين للخطر، مع الإخطار متى كان ذلك معقولًا. ويمكنك التوقف عن استخدام فورما في أي وقت وطلب حذف حسابك.',
        ],
      ],
    },
    {
      h: ['Liability & disclaimers', 'المسؤولية وإخلاء المسؤولية'],
      b: [
        [
          'The Service is provided “as is” and “as available”. We work hard to keep it reliable and secure, but we cannot promise it will always be uninterrupted or error-free, so keep your own copies of anything important.',
          'To the fullest extent permitted by law, Forma is not liable for indirect, incidental or consequential losses, lost profits or lost data, or for any injury or health outcome arising from guidance given by a coach or from exercise and nutrition activities.',
          'Our total liability for any claim relating to the Service is limited to the fees you paid to Forma in the three months before the claim arose.',
          'Nothing in these Terms limits any liability or right that cannot be limited under Egyptian law.',
        ],
        [
          'تُقدَّم الخدمة «كما هي» و«حسب توفرها». نبذل جهدنا للحفاظ على موثوقيتها وأمانها، لكن لا يمكننا ضمان عملها دائمًا دون انقطاع أو أخطاء، لذا احتفظ بنسخ من أي محتوى مهم.',
          'في أقصى حدود ما يسمح به القانون، لا تتحمّل فورما المسؤولية عن الخسائر غير المباشرة أو العرضية أو التبعية أو فوات الأرباح أو فقدان البيانات، ولا عن أي إصابة أو نتيجة صحية تنشأ عن توجيهات المدرب أو عن ممارسة التمارين أو اتباع نظام غذائي.',
          'تقتصر مسؤوليتنا الإجمالية عن أي مطالبة تتعلق بالخدمة على الرسوم التي دفعتها لفورما خلال الأشهر الثلاثة السابقة لنشوء المطالبة.',
          'لا يحدّ أي شيء في هذه الشروط من أي مسؤولية أو حق لا يجوز تقييده وفقًا للقانون المصري.',
        ],
      ],
    },
    {
      h: ['Governing law & contact', 'القانون الحاكم والتواصل'],
      b: [
        [
          'These Terms are governed by the laws of the Arab Republic of Egypt. If a dispute arises, please contact us first so we can try to resolve it informally; otherwise it will be settled by the competent courts of Cairo, Egypt.',
          `Questions about these Terms: ${MAIL} · WhatsApp ${WA}.`,
        ],
        [
          'تخضع هذه الشروط لقوانين جمهورية مصر العربية. إذا نشأ أي نزاع فيُرجى التواصل معنا أولًا لمحاولة حلّه وديًا، وإلا تختص به محاكم القاهرة المختصة.',
          `للاستفسار عن هذه الشروط: ${MAIL} · واتساب ${WA}.`,
        ],
      ],
    },
  ],
};

const PRIVACY_POLICY: LegalPage = {
  t: ['Privacy Policy', 'سياسة الخصوصية'],
  s: [
    {
      h: ['Who we are', 'من نحن'],
      b: [
        [
          'Forma is a coaching platform operated from the Arab Republic of Egypt. This policy explains what personal data we process when you use the Forma website and app, why, and the choices you have. We handle personal data in line with Egypt’s Personal Data Protection Law No. 151 of 2020 and its Executive Regulations.',
          'Forma is responsible for the data needed to run accounts and the platform. The information a coach records about a client is used by that coach for their coaching, and Forma processes it to provide the Service to both of them.',
          `Privacy contact: ${MAIL}.`,
        ],
        [
          'فورما منصة تدريب تُدار من جمهورية مصر العربية. توضّح هذه السياسة البيانات الشخصية التي نعالجها عند استخدامك لموقع فورما وتطبيقها، وسبب ذلك، والخيارات المتاحة لك. ونتعامل مع البيانات الشخصية وفقًا لقانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020 ولائحته التنفيذية.',
          'فورما مسؤولة عن البيانات اللازمة لتشغيل الحسابات والمنصة. أما المعلومات التي يسجّلها المدرب عن عميله فيستخدمها المدرب في تدريبه، وتعالجها فورما لتقديم الخدمة لكليهما.',
          `للتواصل بخصوص الخصوصية: ${MAIL}.`,
        ],
      ],
    },
    {
      h: ['What we collect', 'البيانات التي نجمعها'],
      b: [
        [
          {
            ul: [
              '<b>Account details</b> — name, email, phone number, password (stored only as a secure hash), profile photo, time zone and language. For coaches also bio, specialty, years of experience and the social or WhatsApp handles you choose to add.',
              '<b>Health & fitness data</b> — the onboarding assessment (date of birth, gender, height, weight, goals, activity level, sleep, injuries, medical conditions, allergies and food preferences), workouts, nutrition, cardio, weight and body measurements, progress and assessment photos, check-ins, plans, coach notes and targets.',
              '<b>Messages</b> between client and coach — text, images, videos, voice notes and files, with reactions and read times.',
              '<b>Subscription records</b> — Forma plan, price, term dates and renewal requests, and the subscription terms a coach sets for a client. We do not collect card or bank details.',
              '<b>Technical data</b> — your IP address (kept briefly to protect sign-in and forms from abuse), the days you were active, aggregated usage counts, and anonymous page-view statistics.',
              '<b>Contact form</b> — the name, email, phone, role and message you send us.',
            ],
          },
          'Health data is sensitive personal data. We process it only with your explicit consent, which you give when you enter it or allow your coach to record it. You can withdraw that consent at any time by contacting us — but your coach may then be unable to coach you through Forma.',
        ],
        [
          {
            ul: [
              '<b>بيانات الحساب</b> — الاسم والبريد الإلكتروني ورقم الهاتف وكلمة المرور (تُخزَّن فقط بصيغة مشفّرة آمنة) وصورة الملف الشخصي والمنطقة الزمنية واللغة. وللمدربين أيضًا النبذة والتخصص وسنوات الخبرة وحسابات التواصل أو واتساب التي يختارون إضافتها.',
              '<b>البيانات الصحية والرياضية</b> — استمارة التقييم الأولي (تاريخ الميلاد والنوع والطول والوزن والأهداف ومستوى النشاط والنوم والإصابات والحالات الصحية والحساسية والتفضيلات الغذائية) والتمارين والتغذية والكارديو والوزن وقياسات الجسم وصور التقدّم والتقييم والمتابعات الدورية والخطط وملاحظات المدرب وأهدافه.',
              '<b>الرسائل</b> بين العميل والمدرب — النصوص والصور والفيديوهات والرسائل الصوتية والملفات، مع التفاعلات وأوقات القراءة.',
              '<b>سجلات الاشتراك</b> — خطة فورما والسعر وتواريخ المدة وطلبات التجديد، وشروط الاشتراك التي يحددها المدرب للعميل. لا نجمع بيانات البطاقات أو الحسابات البنكية.',
              '<b>البيانات التقنية</b> — عنوان IP (يُحتفظ به لفترة قصيرة لحماية تسجيل الدخول والنماذج من إساءة الاستخدام) والأيام التي كنت نشطًا فيها وإحصاءات استخدام مجمّعة وإحصاءات مجهولة لزيارات الصفحات.',
              '<b>نموذج التواصل</b> — الاسم والبريد والهاتف والدور والرسالة التي ترسلها لنا.',
            ],
          },
          'البيانات الصحية بيانات شخصية حساسة، ولا نعالجها إلا بموافقتك الصريحة التي تمنحها عند إدخالها أو السماح لمدربك بتسجيلها. ويمكنك سحب هذه الموافقة في أي وقت بالتواصل معنا — لكن قد يتعذّر على مدربك حينها تدريبك عبر فورما.',
        ],
      ],
    },
    {
      h: ['How we use it', 'كيف نستخدمها'],
      b: [
        [
          {
            ul: [
              'To provide the coaching service between coach and client — plans, logs, progress, check-ins and messaging.',
              'To create and secure accounts, keep you signed in and prevent abuse.',
              'To manage trials, subscriptions and renewals.',
              'To send service emails (welcome, password reset, invitations, subscription updates) and in-app notifications.',
              'To answer support requests and messages you send us.',
              'To fix problems and improve Forma using aggregated, non-identifying statistics.',
              'To comply with the law.',
            ],
          },
          'We do not sell personal data, we do not use it for advertising, and we do not use it to make automated decisions about you — your plan is always written by your coach.',
        ],
        [
          {
            ul: [
              'لتقديم خدمة التدريب بين المدرب والعميل — الخطط والسجلات والتقدّم والمتابعات والمراسلة.',
              'لإنشاء الحسابات وتأمينها والإبقاء على تسجيل دخولك ومنع إساءة الاستخدام.',
              'لإدارة التجارب المجانية والاشتراكات والتجديدات.',
              'لإرسال رسائل الخدمة عبر البريد (الترحيب وإعادة تعيين كلمة المرور والدعوات وتحديثات الاشتراك) والإشعارات داخل التطبيق.',
              'للرد على طلبات الدعم والرسائل التي ترسلها لنا.',
              'لإصلاح المشكلات وتحسين فورما باستخدام إحصاءات مجمّعة لا تحدّد هويتك.',
              'للالتزام بالقانون.',
            ],
          },
          'لا نبيع البيانات الشخصية، ولا نستخدمها في الإعلانات، ولا نتخذ بها قرارات آلية بشأنك — فخطتك يكتبها مدربك دائمًا.',
        ],
      ],
    },
    {
      h: ['Who can see client data', 'من يمكنه رؤية بيانات العميل'],
      b: [
        [
          {
            ul: [
              '<b>You</b>, through your own account — including the notes your coach writes for you.',
              '<b>Your assigned coach</b>, for as long as you work together. If the coach releases you, they lose access and your data stays with your account.',
              '<b>A new coach</b> you are transferred to. Depending on the transfer, they see your history and plans, or start fresh while your previous coach’s plans and notes are archived and not shown to them.',
              '<b>Authorised Forma administrators</b>, only where needed to operate, support or secure the Service or to meet a legal obligation. Message threads are limited to the client, the coach and senior administrators, and administrative actions are logged.',
            ],
          },
        ],
        [
          {
            ul: [
              '<b>أنت</b>، من خلال حسابك — بما في ذلك الملاحظات التي يكتبها لك مدربك.',
              '<b>مدربك الحالي</b>، طوال فترة عملكما معًا. إذا أنهى المدرب التعامل معك يفقد صلاحية الوصول وتبقى بياناتك مع حسابك.',
              '<b>المدرب الجديد</b> عند نقلك إليه. وحسب نوع النقل، يرى سجلك وخططك، أو يبدأ من جديد بينما تُؤرشف خطط وملاحظات مدربك السابق ولا تُعرض له.',
              '<b>مسؤولو فورما المصرّح لهم</b>، فقط عند الحاجة لتشغيل الخدمة أو دعمها أو تأمينها أو للوفاء بالتزام قانوني. وتقتصر محادثات الرسائل على العميل والمدرب وكبار المسؤولين، وتُسجَّل الإجراءات الإدارية.',
            ],
          },
        ],
      ],
    },
    {
      h: ['Sharing & processors', 'المشاركة ومقدمو الخدمات'],
      b: [
        [
          'We use trusted service providers that process data on our behalf and only for running Forma:',
          {
            table: [
              ['Provider', 'Purpose'],
              ['Vercel', 'Hosting, servers and anonymous page analytics'],
              ['MongoDB Atlas', 'Database'],
              ['Bunny.net', 'Storage and delivery of photos, videos, voice notes and files (EU data centre)'],
              ['Resend', 'Service emails'],
              ['Google', 'Sign in with Google, web fonts, embedded YouTube exercise videos'],
              ['wger / Open Food Facts', 'Food search (only the search text is sent)'],
            ],
          },
          'Some of these providers store data outside Egypt, including in the European Union and the United States. We transfer data only as needed to provide the Service and in line with the requirements of Egyptian law for cross-border transfers.',
          'We may also disclose data when the law requires it, or when necessary to protect someone’s safety. If Forma is reorganised or acquired, data may transfer to the new operator, and we will tell you before that happens.',
        ],
        [
          'نستعين بمقدّمي خدمات موثوقين يعالجون البيانات نيابة عنا ولغرض تشغيل فورما فقط:',
          {
            table: [
              ['مقدّم الخدمة', 'الغرض'],
              ['Vercel', 'الاستضافة والخوادم وإحصاءات مجهولة لزيارات الصفحات'],
              ['MongoDB Atlas', 'قاعدة البيانات'],
              ['Bunny.net', 'تخزين وتوصيل الصور والفيديوهات والرسائل الصوتية والملفات (مركز بيانات في الاتحاد الأوروبي)'],
              ['Resend', 'رسائل البريد الخاصة بالخدمة'],
              ['Google', 'تسجيل الدخول بجوجل وخطوط الويب وفيديوهات التمارين المضمّنة من يوتيوب'],
              ['wger / Open Food Facts', 'البحث عن الأطعمة (يُرسل نص البحث فقط)'],
            ],
          },
          'يخزّن بعض مقدّمي الخدمات البيانات خارج مصر، بما في ذلك الاتحاد الأوروبي والولايات المتحدة. ولا ننقل البيانات إلا بالقدر اللازم لتقديم الخدمة ووفقًا لمتطلبات القانون المصري بشأن النقل عبر الحدود.',
          'وقد نفصح عن البيانات أيضًا إذا اقتضى القانون ذلك أو عند الضرورة لحماية سلامة شخص ما. وإذا أُعيدت هيكلة فورما أو تم الاستحواذ عليها فقد تنتقل البيانات إلى المشغّل الجديد، وسنبلغك قبل حدوث ذلك.',
        ],
      ],
    },
    {
      h: ['Retention, deletion & security', 'مدة الاحتفاظ والحذف والأمان'],
      b: [
        [
          {
            ul: [
              'Account, health and fitness data and messages are kept while your account exists, so your coaching history stays available — including after a coach releases you.',
              'Sign-in sessions expire after 30 days of inactivity, password-reset links after 1 hour, and anti-abuse IP records within an hour.',
              'Contact-form messages are kept in our inbox only as long as needed to reply.',
            ],
          },
          `To delete your account or get a copy of your data, email ${MAIL} from the address on your account. We will verify the request and complete it within 30 days, deleting your data — including uploaded photos, videos and files — from our active systems. Remaining backup and legally required records are cleared in their normal cycle.`,
          'We protect data with encrypted connections (HTTPS), securely hashed passwords, short-lived sign-in tokens, rate limits on sign-in and forms, role-based access controls and audit logs. Uploaded media is stored on our delivery network behind long random links that are not listed anywhere. If a breach affects your personal data, we will notify the Personal Data Protection Center and you within the time limits set by law.',
        ],
        [
          {
            ul: [
              'تُحفظ بيانات الحساب والبيانات الصحية والرياضية والرسائل طوال وجود حسابك، حتى يظل سجل تدريبك متاحًا — بما في ذلك بعد إنهاء المدرب للتعامل معك.',
              'تنتهي جلسات تسجيل الدخول بعد 30 يومًا من عدم النشاط، وروابط إعادة تعيين كلمة المرور بعد ساعة، وسجلات عناوين IP الخاصة بمنع الإساءة خلال ساعة.',
              'تُحفظ رسائل نموذج التواصل في بريدنا فقط طوال المدة اللازمة للرد.',
            ],
          },
          `لحذف حسابك أو الحصول على نسخة من بياناتك، راسلنا على ${MAIL} من البريد المسجّل في حسابك. سنتحقق من الطلب وننفّذه خلال 30 يومًا، بحذف بياناتك — بما في ذلك الصور والفيديوهات والملفات المرفوعة — من أنظمتنا النشطة، بينما تُمسح النسخ الاحتياطية والسجلات التي يُلزمنا القانون بها في دورتها المعتادة.`,
          'نحمي البيانات باتصالات مشفّرة (HTTPS) وكلمات مرور مخزّنة بتشفير آمن ورموز دخول قصيرة الصلاحية وحدود لعدد محاولات الدخول والنماذج وصلاحيات وصول حسب الدور وسجلات تدقيق. وتُخزَّن الوسائط المرفوعة على شبكة التوصيل خلف روابط عشوائية طويلة غير منشورة في أي مكان. وإذا تأثرت بياناتك الشخصية بأي اختراق، فسنُخطر مركز حماية البيانات الشخصية ونُخطرك خلال المدد التي يحددها القانون.',
        ],
      ],
    },
    {
      h: ['Your rights', 'حقوقك'],
      b: [
        [
          'Under Egyptian data protection law you have the right to:',
          {
            ul: [
              'know what personal data we hold about you and how it is used;',
              'get access to and a copy of your data;',
              'correct or update inaccurate data;',
              'have your data deleted;',
              'object to or restrict certain processing;',
              'withdraw your consent at any time.',
            ],
          },
          `Most account details can be edited in the app. For anything else, email ${MAIL}; we may need to verify your identity first. If you are not satisfied with our answer, you can complain to Egypt’s Personal Data Protection Center.`,
        ],
        [
          'وفقًا لقانون حماية البيانات المصري يحق لك:',
          {
            ul: [
              'معرفة البيانات الشخصية التي نحتفظ بها عنك وكيفية استخدامها؛',
              'الاطلاع على بياناتك والحصول على نسخة منها؛',
              'تصحيح البيانات غير الدقيقة أو تحديثها؛',
              'حذف بياناتك؛',
              'الاعتراض على بعض أنواع المعالجة أو تقييدها؛',
              'سحب موافقتك في أي وقت.',
            ],
          },
          `يمكن تعديل معظم بيانات الحساب من داخل التطبيق. ولأي طلب آخر راسلنا على ${MAIL}، وقد نحتاج إلى التحقق من هويتك أولًا. وإذا لم يرضِك ردّنا، يمكنك تقديم شكوى إلى مركز حماية البيانات الشخصية في مصر.`,
        ],
      ],
    },
    {
      h: ['Children', 'الأطفال'],
      b: [
        [
          'Forma is not directed at children. Coach accounts are for adults aged 18 or over. A client under 18 may use Forma only with the consent of a parent or legal guardian, which the inviting coach must obtain. If we learn that we hold a child’s data without that consent, we will delete it.',
        ],
        [
          'فورما غير موجّهة للأطفال. حسابات المدربين مخصصة للبالغين من سن 18 عامًا فأكثر، ولا يجوز لعميل دون 18 عامًا استخدام فورما إلا بموافقة أحد الوالدين أو الولي القانوني، ويجب على المدرب الذي يدعوه الحصول عليها. وإذا علمنا أننا نحتفظ ببيانات طفل دون هذه الموافقة فسنحذفها.',
        ],
      ],
    },
    {
      h: ['Changes & contact', 'التغييرات والتواصل'],
      b: [
        [
          'If we make material changes to this policy, we will tell you in the app or by email before they take effect. The date at the top shows when it was last updated.',
          `Privacy questions or requests: ${MAIL} · WhatsApp ${WA}. See also our ${COOKIES('Cookie Policy')}.`,
        ],
        [
          'إذا أجرينا تغييرات جوهرية على هذه السياسة فسنُبلغك داخل التطبيق أو عبر البريد قبل سريانها، ويوضّح التاريخ في أعلى الصفحة آخر تحديث لها.',
          `للأسئلة أو الطلبات المتعلقة بالخصوصية: ${MAIL} · واتساب ${WA}. راجع أيضًا ${COOKIES('سياسة ملفات الارتباط')}.`,
        ],
      ],
    },
  ],
};

const COOKIE_POLICY: LegalPage = {
  t: ['Cookie Policy', 'سياسة ملفات الارتباط'],
  s: [
    {
      h: ['What cookies are', 'ما هي ملفات الارتباط'],
      b: [
        [
          'Cookies are small text files a website saves in your browser. Similar technologies — local storage, IndexedDB and the app’s offline cache — let Forma remember things on your device. This policy explains exactly which ones Forma uses and why.',
        ],
        [
          'ملفات الارتباط (الكوكيز) ملفات نصية صغيرة يحفظها الموقع في متصفحك. وهناك تقنيات مشابهة — مثل التخزين المحلي وIndexedDB وذاكرة التطبيق للعمل دون اتصال — تتيح لفورما تذكّر بعض الأشياء على جهازك. توضّح هذه السياسة بالضبط ما تستخدمه فورما منها ولماذا.',
        ],
      ],
    },
    {
      h: ['Cookies Forma uses', 'الملفات التي تستخدمها فورما'],
      b: [
        [
          'Forma sets a single cookie, and it is strictly necessary. We do not use advertising or cross-site tracking cookies.',
          {
            table: [
              ['Name', 'Purpose', 'Duration', 'Type'],
              ['forma_rt', 'Keeps you securely signed in (secure, HTTP-only, same-site)', '30 days, renewed while you use Forma', 'First-party · strictly necessary'],
            ],
          },
          'Forma also stores on your device:',
          {
            ul: [
              '<b>App data (IndexedDB)</b> — your plans, logs, settings including language, and drafts, so the app is fast and works offline. It stays until you clear site data in your browser.',
              '<b>Preferences (local & session storage)</b> — sidebar layout, the microphone prompt, a once-a-day activity marker and dismissed banners.',
              '<b>Offline cache</b> — app files, fonts, images and exercise videos you have opened.',
            ],
          },
          'Page analytics are provided by Vercel Web Analytics, which does not use cookies or follow you across websites; it only counts anonymous page views.',
          'Some features are provided by Google: exercise videos embedded from YouTube and “Sign in with Google”. Google may set its own cookies when you play a video or use Google sign-in, under Google’s privacy policy.',
        ],
        [
          'تضع فورما ملف ارتباط واحدًا فقط، وهو ضروري تمامًا. ولا نستخدم ملفات ارتباط إعلانية أو لتتبعك عبر المواقع.',
          {
            table: [
              ['الاسم', 'الغرض', 'المدة', 'النوع'],
              ['forma_rt', 'يُبقي تسجيل دخولك آمنًا (آمن، HTTP-only، نفس الموقع)', '30 يومًا، ويتجدد أثناء استخدامك لفورما', 'من فورما · ضروري تمامًا'],
            ],
          },
          'كما تخزّن فورما على جهازك:',
          {
            ul: [
              '<b>بيانات التطبيق (IndexedDB)</b> — خططك وسجلاتك وإعداداتك بما فيها اللغة والمسودات، ليعمل التطبيق بسرعة ودون اتصال. وتبقى حتى تمسح بيانات الموقع من متصفحك.',
              '<b>التفضيلات (التخزين المحلي وتخزين الجلسة)</b> — شكل القائمة الجانبية وتنبيه الميكروفون وعلامة نشاط يومية واحدة والإعلانات التي أغلقتها.',
              '<b>ذاكرة العمل دون اتصال</b> — ملفات التطبيق والخطوط والصور وفيديوهات التمارين التي فتحتها.',
            ],
          },
          'تُقدَّم إحصاءات الصفحات عبر Vercel Web Analytics، وهي لا تستخدم ملفات ارتباط ولا تتبعك عبر المواقع، وتكتفي بعدّ زيارات الصفحات بشكل مجهول.',
          'بعض الخصائص تقدّمها جوجل: فيديوهات التمارين المضمّنة من يوتيوب و«تسجيل الدخول بجوجل». وقد تضع جوجل ملفات ارتباط خاصة بها عند تشغيل فيديو أو استخدام تسجيل الدخول بجوجل، وفقًا لسياسة خصوصية جوجل.',
        ],
      ],
    },
    {
      h: ['Managing cookies', 'التحكم في ملفات الارتباط'],
      b: [
        [
          'The forma_rt cookie is required to stay signed in — if you block it, you will not be able to sign in. You can delete cookies and site data at any time in your browser settings; this signs you out and removes offline data that has not synced yet.',
          'Because Forma only uses strictly necessary cookies, we do not show a consent banner. If we ever add non-essential cookies, we will ask for your consent first.',
        ],
        [
          'ملف forma_rt ضروري للبقاء مسجّلًا للدخول — وإذا حظرته فلن تتمكن من تسجيل الدخول. ويمكنك حذف ملفات الارتباط وبيانات الموقع في أي وقت من إعدادات متصفحك، وسيؤدي ذلك إلى تسجيل خروجك وحذف البيانات غير المتزامنة بعد.',
          'ولأن فورما لا تستخدم إلا ملفات الارتباط الضرورية تمامًا، فلا نعرض شريط موافقة. وإذا أضفنا يومًا ملفات ارتباط غير ضرورية فسنطلب موافقتك أولًا.',
        ],
      ],
    },
    {
      h: ['Changes & contact', 'التغييرات والتواصل'],
      b: [
        [
          'We will update this policy if the cookies or storage Forma uses change; the date at the top shows the latest version.',
          `Questions: ${MAIL}. See also our ${PRIVACY('Privacy Policy')}.`,
        ],
        [
          'سنحدّث هذه السياسة إذا تغيّرت ملفات الارتباط أو وسائل التخزين التي تستخدمها فورما، ويوضّح التاريخ في أعلى الصفحة أحدث نسخة.',
          `للاستفسارات: ${MAIL}. راجع أيضًا ${PRIVACY('سياسة الخصوصية')}.`,
        ],
      ],
    },
  ],
};

export const LEGAL_CONTENT: Record<LegalDocKey, LegalPage> = { terms: TERMS, privacy: PRIVACY_POLICY, cookies: COOKIE_POLICY };

// The privacy policy and the terms of use, in Arabic and English: plain pages the
// server renders on every host (the landing page, the dashboard and each salon's
// link), readable without the app. On a salon's link they wear the salon's name,
// icon and page colours, and say who does what: the salon serves its customers,
// the platform runs the page and keeps the data for it.
//
// The text describes what the code does (what is stored, who sees it, how long it
// is kept); change both together.
import { iconVersion } from './brand.js';
import { accentForDark, accentForLight, dayBase, nightBase, onColor } from './colors.js';
import { config } from './config.js';
import { requestProto, type Ctx } from './http.js';
import type { Salon } from './tenancy.js';

export type LegalDoc = 'privacy' | 'terms';
type Lang = 'ar' | 'en';

/** When the text last changed in substance. */
const UPDATED = '2026-10-14';

type Block = string | string[];
interface Section {
  title: string;
  body: Block[];
}
interface Doc {
  title: string;
  intro: string;
  /** Shown on a salon's link, above the sections. */
  salonNote: string;
  sections: Section[];
}

// Placeholders, filled in when the page is rendered: {brand} the platform's name,
// {salon} the salon's, {days} how long a sign-in lasts, {contact} the platform's
// WhatsApp number as a link. There is no number until the admin sets one in the
// dashboard (or SEED_CONTACT_PHONE does), so a sentence that needs {contact} stands
// on its own and is left out without one; a section left empty goes with it.
// **text** is bold.

const PRIVACY: Record<Lang, Doc> = {
  ar: {
    title: 'سياسة الخصوصية',
    intro: '{brand} منصة تمنح الصالونات ومحلات الحلاقة صفحة وتطبيقًا للحجز. توضح هذه السياسة البيانات التي نجمعها، ولماذا نجمعها، ومن يطّلع عليها، ومدة الاحتفاظ بها، وكيف تتحكم بها.',
    salonNote: 'يستخدم {salon} منصة {brand} لصفحته وحجوزاته. الصالون هو من يقدّم الخدمة ويتواصل معك بشأن موعدك، ونحن نشغّل الصفحة ونحفظ بيانات الحجز نيابةً عنه.',
    sections: [
      {
        title: 'من المسؤول عن بياناتك',
        body: [
          'عندما تحجز في صالون، فإن الصالون هو من يقدّم لك الخدمة ويقرّر كيف يستخدم بيانات حجزك لخدمتك. أما {brand} فتشغّل المنصة وتحفظ هذه البيانات وتعالجها نيابةً عن الصالون ووفق هذه السياسة.',
          'وبيانات حسابات أصحاب الصالونات ومعلومات الصالونات نفسها نعالجها نحن لتشغيل المنصة.',
        ],
      },
      {
        title: 'البيانات التي نجمعها',
        body: [
          '**عندما تحجز موعدًا:**',
          [
            'اسمك ورقم هاتفك.',
            'تفاصيل الحجز: الخدمة والموظف والموعد والسعر والعربون وحالة الحجز.',
            'صورة تحويل كليك إذا طلب الصالون عربونًا، والملاحظة التي تكتبها مع التحويل إن وجدت. ترفعها أو تستبدلها قبل أن يبدأ موعدك فقط، وإلى أن يبتّ الصالون فيها. قد تظهر في الصورة بيانات من تطبيق بنكك، مثل اسمك ومرجع التحويل، لذلك نحفظها بشكل خاص.',
          ],
          '**عندما تدير صالونًا:**',
          [
            'اسمك ورقم هاتفك وكلمة مرورك. نحفظ كلمة المرور مشفّرة بطريقة لا يمكن استرجاعها، فلا يراها أحد، ولا حتى نحن.',
            'معلومات الصالون التي تضيفها: الاسم والوصف والعنوان والهاتف والشعار والصور وأسماء الفريق وصورهم والخدمات والأسعار وأوقات الدوام وبيانات كليك لاستلام العربون.',
            'آخر وقت استخدمت فيه لوحة الإدارة.',
          ],
          'ونستخدم عنوان IP لجهازك بشكل مؤقت للحدّ من محاولات الدخول والحجوزات المتكررة، ولا نحفظه في قاعدة بياناتنا. لا نطلب بريدك الإلكتروني ولا موقعك الجغرافي ولا بيانات بطاقتك البنكية.',
        ],
      },
      {
        title: 'لماذا نستخدمها',
        body: [
          [
            'لإنشاء حجزك، وإظهاره للصالون، وعرض تفاصيله وحالته على صفحة حجزك.',
            'ليتحقق الصالون من وصول العربون.',
            'ليتواصل معك الصالون بشأن موعدك عند الحاجة.',
            'لتشغيل حسابات أصحاب الصالونات وحمايتها.',
            'لمنع إساءة الاستخدام، مثل الحجوزات الوهمية ومحاولات الدخول المتكررة.',
          ],
          'لا نبيع بياناتك، ولا نستخدمها للإعلانات، ولا نرسل لك رسائل تسويقية.',
        ],
      },
      {
        title: 'من يطّلع عليها',
        body: [
          [
            '**الصالون الذي حجزت فيه:** يرى اسمك ورقمك وحجوزاتك لديه وصورة التحويل. كل صالون يرى عملاءه فقط، ولا يرى حجوزاتك في الصالونات الأخرى.',
            '**صورة التحويل** لا تُنشر أبدًا: يراها صاحب الصالون، وأنت من خلال رابط حجزك.',
            '**فريق {brand}،** عند الحاجة فقط، لدعم صالون أو حل مشكلة تقنية.',
            '**مزوّد الاستضافة السحابية** Amazon Web Services، الذي تعمل عليه خوادمنا وقاعدة بياناتنا، وقد تكون خارج الأردن.',
            '**الجهات الرسمية،** إذا ألزمنا القانون بذلك.',
          ],
          'أما معلومات الصالون وصور فريقه وأسعار خدماته فهي منشورة للجميع على صفحة الصالون، وتظهر عند مشاركة رابطه وفي نتائج محركات البحث.',
        ],
      },
      {
        title: 'المدفوعات',
        body: ['لا نستلم أي أموال ولا تمرّ عبرنا. يُحوَّل العربون عبر كليك من تطبيق بنكك إلى الصالون مباشرة، ونحن نحفظ فقط صورة التحويل التي ترفعها ليتحقق منها الصالون.'],
      },
      {
        title: 'مدة الاحتفاظ بها',
        body: [
          [
            '**صور التحويل:** نحذفها تلقائيًا بعد أسبوع من آخر تغيير على الحجز: تأكيده أو رفضه أو إلغاؤه أو انتهاء مهلته، أو تسجيل حضورك أو غيابك. وإذا لم يبتّ الصالون في التحويل، نحذف الصورة بعد أسبوع من موعد الزيارة، ويبقى الحجز نفسه في سجلات الصالون.',
            '**تسجيل الدخول:** ينتهي بعد {days} يومًا أو عند تسجيل الخروج، وعند تغيير كلمة المرور تُسجَّل الأجهزة الأخرى خروجًا.',
            '**الحجوزات وبيانات العملاء:** تبقى ضمن سجلات الصالون ما دام يستخدم المنصة، ويمكنك طلب حذفها (انظر «حقوقك»).',
            '**حساب الصالون ومعلوماته:** تبقى ما دام الحساب قائمًا، ونحذفها عندما يطلب صاحب الصالون إغلاقه، إلا ما يلزمنا القانون بالاحتفاظ به.',
          ],
        ],
      },
      {
        title: 'على جهازك',
        body: [
          'لا نستخدم ملفات تعريف الارتباط (الكوكيز) للإعلانات أو التتبع، ولا أدوات تحليلات من جهات أخرى.',
          [
            'ملف تعريف ارتباط واحد يُبقي أصحاب الصالونات مسجّلين في لوحة الإدارة.',
            'يحفظ متصفحك على جهازك لغة التطبيق، واسمك ورقمك لتسريع حجزك القادم، وروابط حجوزاتك. تبقى هذه البيانات على جهازك، ويمكنك حذفها بمسح بيانات الموقع من إعدادات المتصفح.',
          ],
        ],
      },
      {
        title: 'كيف نحميها',
        body: [
          [
            'كل الصفحات تعمل عبر اتصال مشفّر (HTTPS).',
            'كلمات المرور محفوظة بتشفير أحادي الاتجاه.',
            'بيانات كل صالون مفصولة عن غيره، وصور التحويل محفوظة بشكل خاص وغير منشورة.',
            'نحدّ من عدد محاولات الدخول والحجوزات المتكررة.',
          ],
          'لا يوجد نظام آمن تمامًا، لكننا نعمل على حماية بياناتك، وسنبلغك إذا تعرّضت بياناتك لحادث أمني يمسّك.',
        ],
      },
      {
        title: 'حقوقك',
        body: [
          [
            'أن تعرف البيانات التي نحفظها عنك وتطلب نسخة منها.',
            'أن تصحّح بياناتك.',
            'أن تطلب حذفها، ما لم نكن ملزمين قانونيًا بالاحتفاظ بها.',
            'أن تلغي حجزك من صفحة حجزك.',
          ],
          'لطلب أيٍّ من ذلك، تواصل مع الصالون الذي حجزت فيه. قد نطلب ما يثبت أن الرقم رقمك قبل تنفيذ الطلب.',
          'ويمكنك أيضًا مراسلتنا مباشرة على واتساب: {contact}.',
        ],
      },
      {
        title: 'الأطفال',
        body: ['المنصة موجّهة للبالغين. يحجز الأهل أو الأوصياء لأطفالهم باسمهم ورقم هاتفهم.'],
      },
      {
        title: 'التغييرات على هذه السياسة',
        body: ['قد نحدّث هذه السياسة عند إضافة ميزات أو تغيير طريقة عملنا. يظهر تاريخ آخر تحديث أعلى الصفحة، وإذا كان التغيير جوهريًا نوضّحه بشكل ظاهر على المنصة.'],
      },
      {
        title: 'تواصل معنا',
        body: ['للأسئلة والطلبات المتعلقة بالخصوصية، راسلنا على واتساب: {contact}.'],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    intro: '{brand} is a platform that gives salons and barbershops their own page and booking app. This policy explains what data we collect, why, who sees it, how long we keep it, and how you stay in control of it.',
    salonNote: '{salon} uses {brand} for its page and bookings. The salon provides the service and contacts you about your appointment; we run the page and keep the booking data on its behalf.',
    sections: [
      {
        title: 'Who is responsible for your data',
        body: [
          'When you book at a salon, the salon provides the service and decides how your booking details are used to serve you. {brand} runs the platform and stores and processes that data on the salon\'s behalf, under this policy.',
          'Salon owners\' account details and the salons\' own information are processed by us to run the platform.',
        ],
      },
      {
        title: 'What we collect',
        body: [
          '**When you book an appointment:**',
          [
            'Your name and phone number.',
            'The booking: service, staff member, time, price, deposit and status.',
            'Your CliQ transfer screenshot if the salon asks for a deposit, and any note you add with it. You can upload or replace it only before your appointment starts, and until the salon decides on it. The screenshot can show details from your banking app, such as your name and the transfer reference, so we keep it private.',
          ],
          '**When you run a salon:**',
          [
            'Your name, phone number and password. We store the password with one-way encryption that cannot be reversed, so nobody can read it, not even us.',
            'The salon information you add: name, description, address, phone, logo, photos, team names and photos, services, prices, opening hours, and the CliQ details for receiving deposits.',
            'When you last used the dashboard.',
          ],
          'We use your device\'s IP address briefly to limit repeated sign-in attempts and bookings; we do not store it in our database. We do not ask for your email address, your location or your card details.',
        ],
      },
      {
        title: 'Why we use it',
        body: [
          [
            'To create your booking, show it to the salon, and show its details and status on your booking page.',
            'So the salon can check that your deposit arrived.',
            'So the salon can contact you about your appointment when needed.',
            'To run and protect salon owners\' accounts.',
            'To prevent abuse, such as fake bookings and repeated sign-in attempts.',
          ],
          'We do not sell your data, use it for advertising, or send you marketing messages.',
        ],
      },
      {
        title: 'Who sees it',
        body: [
          [
            '**The salon you booked with** sees your name, number, your bookings with it, and the transfer screenshot. Each salon sees only its own customers, never your bookings at other salons.',
            '**The transfer screenshot** is never published: the salon\'s owner sees it, and you do through your booking link.',
            '**The {brand} team,** only when needed to support a salon or fix a technical problem.',
            '**Our cloud hosting provider,** Amazon Web Services, which runs our servers and database, possibly outside Jordan.',
            '**Authorities,** when the law requires us to share it.',
          ],
          'A salon\'s own information, team photos and prices are public on its page, and appear when its link is shared and in search results.',
        ],
      },
      {
        title: 'Payments',
        body: ['We never receive or hold money. Deposits go by CliQ from your banking app straight to the salon; we only keep the screenshot you upload so the salon can check it.'],
      },
      {
        title: 'How long we keep it',
        body: [
          [
            '**Transfer screenshots:** deleted automatically a week after the booking last changes: when it is confirmed, rejected or cancelled, runs out of time, or your visit is marked done or missed. If the salon never decides on the transfer, the screenshot is deleted a week after the appointment, and the booking itself stays in the salon\'s records.',
            '**Sign-ins:** end after {days} days or when you sign out; changing the password signs out other devices.',
            '**Bookings and customer details:** kept in the salon\'s records while the salon uses the platform. You can ask for them to be deleted (see "Your rights").',
            '**A salon\'s account and information:** kept while the account is open, and deleted when the owner asks us to close it, except what the law requires us to keep.',
          ],
        ],
      },
      {
        title: 'On your device',
        body: [
          'We use no cookies for advertising or tracking, and no third-party analytics.',
          [
            'One cookie keeps salon owners signed in to their dashboard.',
            'Your browser keeps, on your device only, the app\'s language, your name and number to make your next booking quicker, and links to your bookings. You can remove them by clearing this site\'s data in your browser settings.',
          ],
        ],
      },
      {
        title: 'How we protect it',
        body: [
          [
            'Every page is served over an encrypted connection (HTTPS).',
            'Passwords are stored with one-way encryption.',
            'Each salon\'s data is kept apart from the others, and transfer screenshots are stored privately, never published.',
            'Sign-in attempts and repeated bookings are limited.',
          ],
          'No system is perfectly secure, but we work to protect your data, and we will tell you if a security incident affects your data.',
        ],
      },
      {
        title: 'Your rights',
        body: [
          [
            'To know what data we hold about you and get a copy.',
            'To correct it.',
            'To have it deleted, unless the law requires us to keep it.',
            'To cancel your booking from your booking page.',
          ],
          'For any of these, contact the salon you booked with. We may ask you to show the number is yours first.',
          'You can also message us directly on WhatsApp: {contact}.',
        ],
      },
      {
        title: 'Children',
        body: ['The platform is meant for adults. Parents or guardians book for their children, under their own name and phone number.'],
      },
      {
        title: 'Changes to this policy',
        body: ['We may update this policy when we add features or change how we work. The date at the top shows the last update, and we will point out significant changes clearly on the platform.'],
      },
      {
        title: 'Contact us',
        body: ['For privacy questions and requests, message us on WhatsApp: {contact}.'],
      },
    ],
  },
};

const TERMS: Record<Lang, Doc> = {
  ar: {
    title: 'شروط الاستخدام',
    intro: 'تنظّم هذه الشروط استخدامك لمنصة {brand}، سواء كنت تحجز موعدًا في صالون أو تدير صالونًا. باستخدامك المنصة فإنك توافق عليها.',
    salonNote: 'يستخدم {salon} منصة {brand} لصفحته وحجوزاته. الخدمة نفسها وأسعارها ومواعيدها وسياسة الإلغاء والاسترجاع يحددها {salon}.',
    sections: [
      {
        title: 'ما هي {brand}',
        body: ['{brand} أداة تمنح كل صالون صفحة وتطبيقًا لاستقبال الحجوزات وإدارتها. الصالون هو من يقدّم الخدمة ويحدد أسعارها ومواعيدها وسياساته، ونحن نوفّر الأداة فقط ولسنا طرفًا في الخدمة نفسها.'],
      },
      {
        title: 'الحجز',
        body: [
          [
            'أدخل اسمك ورقم هاتفك الصحيحين، فهما ما يستخدمه الصالون للتواصل معك.',
            'يكون حجزك مؤكدًا عندما تُظهر صفحة حجزك ذلك.',
            'إذا لم تستطع الحضور فألغِ الحجز من صفحة حجزك في أقرب وقت ليستفيد غيرك من الموعد.',
            'قد يلغي الصالون الحجز لظرف طارئ، ويتواصل معك عندها.',
            'لا تحجز مواعيد لا تنوي حضورها. لكل رقم حدٌّ من الحجوزات القادمة، ويحق للصالون رفض الحجوزات الوهمية.',
          ],
        ],
      },
      {
        title: 'العربون عن طريق كليك',
        body: [
          [
            'قد يطلب الصالون عربونًا لتثبيت الموعد. تحوّله من تطبيق بنكك إلى اسم كليك الخاص بالصالون، ثم ترفع صورة التحويل.',
            'يبقى الموعد محجوزًا لك خلال المهلة الظاهرة على صفحة الحجز. إذا لم ترسل التحويل خلالها يُلغى الحجز ويعود الموعد متاحًا.',
            'ارفع صورة حقيقية للتحويل قبل أن يبدأ موعدك. يراجعها الصالون، فيؤكد الحجز أو يرفضه إذا لم يصله المبلغ، ويمكنك استبدالها إلى أن يقرّر.',
            'يذهب المبلغ إلى الصالون مباشرة. الاسترجاع أو الخصم من العربون عند الإلغاء أو عدم الحضور يخضع لسياسة الصالون وتطلبه منه، فنحن لا نستلم المال ولا نستطيع إرجاعه.',
          ],
        ],
      },
      {
        title: 'أصحاب الصالونات',
        body: [
          [
            'أنت مسؤول عن صحة معلومات صالونك وخدماته وأسعاره وأوقاته، وعن الالتزام بالحجوزات التي تقبلها.',
            'ارفع فقط صورًا وشعارات تملك حق استخدامها، وخذ موافقة أعضاء فريقك قبل نشر أسمائهم وصورهم.',
            'استخدم بيانات عملائك لخدمتهم وإدارة مواعيدهم فقط، ولا تشاركها مع غيرك ولا ترسل لهم رسائل لم يوافقوا عليها.',
            'راجع صور التحويل بأمانة، ولا تؤكد الحجز قبل أن يصلك المبلغ.',
            'احفظ كلمة مرورك ولا تشاركها، فأنت مسؤول عمّا يتم من حسابك.',
            'تمنحنا إذنًا بعرض محتوى صالونك (الاسم والشعار والصور والخدمات) على صفحتك وفي معاينات الروابط وأيقونة التطبيق، لتشغيل المنصة فقط. يبقى المحتوى ملكًا لك.',
          ],
        ],
      },
      {
        title: 'الاستخدام المقبول',
        body: [
          [
            'لا تستخدم المنصة لأي غرض مخالف للقانون، ولا لانتحال شخصية غيرك، ولا لنشر محتوى مسيء.',
            'لا تحاول الوصول إلى بيانات غيرك، أو تعطيل المنصة، أو جمع البيانات منها آليًا.',
          ],
        ],
      },
      {
        title: 'إيقاف الحسابات',
        body: ['يحق لنا إيقاف صالون أو حساب يخالف هذه الشروط أو القانون، أو وفق الاتفاق بين الصالون و{brand}. عند إيقاف صالون تظهر صفحته لعملائه على أنها غير متاحة مؤقتًا.'],
      },
      {
        title: 'توفّر الخدمة ومسؤوليتنا',
        body: [
          [
            'نعمل على أن تكون المنصة متاحة وآمنة، لكننا لا نضمن أن تعمل دون انقطاع أو أخطاء.',
            'لسنا مسؤولين عن الخدمات التي يقدّمها الصالون ولا عن جودتها أو أسعارها، ولا عن أي خلاف بينك وبين الصالون.',
            'في الحدود التي يسمح بها القانون، لا نتحمّل المسؤولية عن الخسائر غير المباشرة الناتجة عن استخدام المنصة أو تعذّر استخدامها.',
          ],
        ],
      },
      {
        title: 'التغييرات على هذه الشروط',
        body: ['قد نحدّث هذه الشروط. يظهر تاريخ آخر تحديث أعلى الصفحة، واستمرارك في استخدام المنصة بعد التحديث يعني موافقتك عليه.'],
      },
      {
        title: 'القانون المطبّق',
        body: ['تخضع هذه الشروط لقوانين المملكة الأردنية الهاشمية، وتختص محاكم عمّان بالنظر في أي نزاع ينشأ عنها.'],
      },
      {
        title: 'تواصل معنا',
        body: ['لأي سؤال عن هذه الشروط، راسلنا على واتساب: {contact}.'],
      },
    ],
  },
  en: {
    title: 'Terms of use',
    intro: 'These terms cover your use of {brand}, whether you are booking at a salon or running one. By using the platform you agree to them.',
    salonNote: '{salon} uses {brand} for its page and bookings. The service itself, its prices, times, and the cancellation and refund policy are set by {salon}.',
    sections: [
      {
        title: 'What {brand} is',
        body: ['{brand} is a tool that gives each salon a page and an app for taking and managing bookings. The salon provides the service and sets its prices, times and policies; we provide the tool only and are not a party to the service itself.'],
      },
      {
        title: 'Booking',
        body: [
          [
            'Enter your real name and phone number; the salon uses them to reach you.',
            'Your booking is confirmed when your booking page says so.',
            'If you cannot come, cancel from your booking page as early as you can, so someone else can have the time.',
            'The salon may cancel a booking if something unexpected comes up, and will contact you.',
            'Do not book times you do not mean to keep. Each number has a limit on upcoming bookings, and salons may turn away fake bookings.',
          ],
        ],
      },
      {
        title: 'CliQ deposits',
        body: [
          [
            'A salon may ask for a deposit to hold your time. You send it from your banking app to the salon\'s CliQ alias, then upload the transfer screenshot.',
            'Your time is held for the period shown on your booking page. If the transfer is not sent in time, the booking is cancelled and the time is released.',
            'Upload a genuine screenshot before your appointment starts. The salon checks it and confirms the booking, or rejects it if the money did not arrive; until it decides, you can replace the screenshot.',
            'The money goes straight to the salon. Refunds, or keeping a deposit after a cancellation or a missed appointment, follow the salon\'s policy and are a matter for the salon: we never receive the money and cannot return it.',
          ],
        ],
      },
      {
        title: 'Salon owners',
        body: [
          [
            'You are responsible for your salon\'s information, services, prices and hours being accurate, and for honouring the bookings you accept.',
            'Upload only photos and logos you have the right to use, and get your team members\' agreement before publishing their names and photos.',
            'Use your customers\' details only to serve them and manage their appointments; do not share them or send messages they have not agreed to.',
            'Check transfer screenshots honestly, and do not confirm a booking before the money arrives.',
            'Keep your password to yourself: you are responsible for what is done from your account.',
            'You allow us to show your salon\'s content (name, logo, photos, services) on your page, in link previews and as your app icon, only to run the platform. The content stays yours.',
          ],
        ],
      },
      {
        title: 'Acceptable use',
        body: [
          [
            'Do not use the platform for anything unlawful, to impersonate someone else, or to publish offensive content.',
            'Do not try to reach other people\'s data, disrupt the platform, or collect data from it automatically.',
          ],
        ],
      },
      {
        title: 'Suspending accounts',
        body: ['We may suspend a salon or an account that breaks these terms or the law, or as agreed between the salon and {brand}. While a salon is suspended, its customers see its page as temporarily unavailable.'],
      },
      {
        title: 'Availability and liability',
        body: [
          [
            'We work to keep the platform available and secure, but cannot promise it will run without interruptions or errors.',
            'We are not responsible for the services a salon provides, their quality or prices, or any dispute between you and a salon.',
            'To the extent the law allows, we are not liable for indirect losses arising from using, or being unable to use, the platform.',
          ],
        ],
      },
      {
        title: 'Changes to these terms',
        body: ['We may update these terms. The date at the top shows the last update; using the platform after an update means you accept it.'],
      },
      {
        title: 'Governing law',
        body: ['These terms are governed by the laws of the Hashemite Kingdom of Jordan, and the courts of Amman have jurisdiction over any dispute arising from them.'],
      },
      {
        title: 'Contact us',
        body: ['For questions about these terms, message us on WhatsApp: {contact}.'],
      },
    ],
  },
};

const DOCS: Record<LegalDoc, Record<Lang, Doc>> = { privacy: PRIVACY, terms: TERMS };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** +962791234567 → +962 79 123 4567; other numbers as they are. */
function showPhone(phone: string): string {
  return /^\+9627\d{8}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}` : phone;
}

interface Fill {
  brand: string;
  salon: string;
  days: string;
  contact: string | null;
}

/** Escapes a piece of text, then fills in its placeholders and **bold**. */
function render(text: string, fill: Fill): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{(brand|salon|days|contact)\}/g, (_, k: keyof Fill) => fill[k] ?? '');
}

/** The app's typeface (Readex), from this host's own files. Unicode ranges keep each file to its script. */
export const FONT_RANGES = {
  arabic: 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};
/** @font-face rules for Readex; `src` gives each file's URL (this host's /assets by default). */
export function fontFaces(src: (file: 'arabic' | 'latin') => string = (f) => `/assets/fonts/readex-${f}.woff2`): string {
  return (['arabic', 'latin'] as const)
    .map((f) => `@font-face{font-family:Readex;font-weight:160 700;font-display:swap;src:url(${src(f)}) format('woff2');unicode-range:${FONT_RANGES[f]}}`)
    .join('\n');
}
export const FONTS = fontFaces();

/** Small inline icons (no image requests): back, the language globe, WhatsApp. */
export const SVG = {
  back: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.5 8.5 12l6.5 6.5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 4 9.5 14.5 14.5 0 0 1-4 9.5 14.5 14.5 0 0 1-4-9.5 14.5 14.5 0 0 1 4-9.5z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.5L3.5 20.5l1.4-4.6A8.4 8.4 0 1 1 20.5 11.6z"/></svg>',
};

const STYLE = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--bg);color:var(--text);font:16.5px/1.9 Readex,system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif}
a{color:var(--accent);text-underline-offset:3px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px max(16px,calc((100% - 1080px)/2));background:var(--bar);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 12px 4px 6px;margin-inline-start:-6px;border-radius:14px;color:var(--text);text-decoration:none;font-weight:700;transition:background-color .2s}
[dir=rtl] .brand{padding:4px 6px 4px 12px}
.brand:hover{background:var(--chip)}
.brand .chev{flex:none;color:var(--text-2)}
[dir=rtl] .chev{transform:scaleX(-1)}
.brand img{flex:none;width:34px;height:34px;border-radius:10px}
.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lang{flex:none;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--line);color:var(--text);font-size:14px;font-weight:600;line-height:1;text-decoration:none;transition:background-color .2s}
.lang:hover{background:var(--chip)}
.lang svg{color:var(--accent)}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
main{position:relative;isolation:isolate;max-width:760px;margin:0 auto;padding:40px 0 16px;counter-reset:s}
main::before{content:'';position:absolute;z-index:-1;top:-60px;inset-inline-start:-140px;width:min(620px,100vw);height:360px;background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 20%,transparent),transparent);pointer-events:none}
.updated{display:inline-flex;align-items:center;gap:8px;margin:0;padding:2px 12px;border-radius:999px;background:var(--chip);color:var(--text-2);font-size:13.5px}
.updated::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent)}
h1{margin:12px 0 12px;font-size:clamp(32px,6vw,46px);line-height:1.25}
.intro{margin:0 0 22px;font-size:18px;color:var(--text-2)}
.note{margin:0 0 26px;padding:14px 18px;border-radius:16px;background:var(--card);border:1px solid var(--line);border-inline-start:3px solid var(--accent)}
section{scroll-margin-top:84px;padding:22px 0 12px;border-top:1px solid var(--line)}
h2{display:flex;align-items:baseline;gap:12px;margin:0 0 10px;font-size:20px;line-height:1.5}
h2::before{counter-increment:s;content:counter(s);flex:none;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;font-size:14px;background:var(--chip);color:var(--accent);transition:background-color .3s,color .3s}
section:target h2::before{background:var(--accent);color:var(--bg)}
p{margin:0 0 12px}
ul{margin:0 0 12px;padding-inline-start:22px}
li{margin:7px 0}
li::marker{color:var(--accent)}
strong{font-weight:600}
bdi{unicode-bidi:isolate;white-space:nowrap}
.toc{display:none}
.toc-h{margin:0 10px 8px;color:var(--text-2);font-size:12.5px;font-weight:600}
ol.list{margin:0;padding:0;list-style:none;counter-reset:t}
ol.list li{margin:0;counter-increment:t}
ol.list a{display:flex;align-items:baseline;gap:10px;padding:6px 10px;border-radius:10px;color:var(--text-2);font-size:14.5px;line-height:1.6;text-decoration:none;transition:background-color .2s,color .2s}
ol.list a::before{content:counter(t);flex:none;min-width:18px;color:var(--accent);font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
ol.list a:hover{color:var(--text);background:var(--chip)}
.toc-m{margin:0 0 10px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
.toc-m summary{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;font-weight:600;cursor:pointer;list-style:none}
.toc-m summary::-webkit-details-marker{display:none}
.toc-m summary::after{content:'+';color:var(--accent);font-size:22px;line-height:1}
.toc-m[open] summary::after{content:'−'}
.toc-m ol.list{padding:0 6px 10px}
@keyframes toc-on{from,to{color:var(--text);background:var(--chip)}}
.foot{margin-top:40px;padding:34px max(20px,calc((100% - 1080px)/2)) calc(28px + env(safe-area-inset-bottom));background:var(--foot);border-top:1px solid var(--line);font-size:14.5px}
.f-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 28px}
.f-brand{display:flex;align-items:center;gap:10px;min-width:0;color:var(--text);font-weight:700;text-decoration:none}
.f-brand img{flex:none;width:32px;height:32px;border-radius:10px}
.f-links{display:flex;flex-wrap:wrap;gap:6px 22px}
.f-links a{color:var(--text-2);font-weight:500;text-decoration:none}
.f-links a:hover,.f-links a[aria-current]{color:var(--text)}
.f-bot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line);color:var(--text-2);font-size:13.5px}
@media (max-width:640px){.f-top,.f-bot{flex-direction:column;text-align:center}.f-links{justify-content:center}}
@media (min-width:1100px){
.wrap{display:grid;grid-template-columns:240px minmax(0,760px);justify-content:space-between;gap:56px}
main{margin:0}
.toc{display:block;position:sticky;top:84px;align-self:start;max-height:calc(100dvh - 100px);overflow:auto;margin-top:40px;padding:14px 6px;border-radius:18px;background:var(--card);border:1px solid var(--line)}
.toc-m{display:none}
}
@media print{.top{position:static;background:none}.toc,.toc-m,.lang{display:none}.foot{background:none}body{background:#fff;color:#000}.note,h2::before{background:#f2f2f2}main::before{display:none}}`;

type Look = Pick<Salon, 'page_theme' | 'color_primary' | 'color_accent'>;

/** A salon's night or day page colours, or the platform's studio (no salon). */
export function paletteFor(salon: Look | null): Record<string, string> {
  if (salon?.page_theme === 'day') {
    const bg = dayBase(salon.color_primary);
    const accent = accentForLight(salon.color_accent);
    return {
      '--bg': bg, '--bar': `${bg}e6`, '--card': '#ffffff', '--chip': 'rgb(0 0 0 / .045)', '--foot': '#ffffff',
      '--text': '#1b1a19', '--text-2': '#5f5a52', '--line': 'rgb(0 0 0 / .09)', '--accent': accent,
      '--grad': `linear-gradient(135deg, color-mix(in srgb, ${accent}, #fff 16%), ${accent} 50%, color-mix(in srgb, ${accent}, #000 14%))`, '--on-grad': onColor(accent),
    };
  }
  if (salon) {
    const bg = nightBase(salon.color_primary);
    const accent = accentForDark(salon.color_accent);
    return {
      '--bg': bg, '--bar': `${bg}e0`, '--card': 'rgb(255 255 255 / .05)', '--chip': 'rgb(255 255 255 / .07)', '--foot': 'rgb(0 0 0 / .22)',
      '--text': '#f4f2ef', '--text-2': 'rgb(244 242 239 / .68)', '--line': 'rgb(255 255 255 / .1)', '--accent': accent,
      '--grad': `linear-gradient(135deg, color-mix(in srgb, ${accent}, #fff 24%), ${accent} 48%, color-mix(in srgb, ${accent}, #000 16%))`, '--on-grad': onColor(accent),
    };
  }
  return {
    '--bg': '#0a0918', '--bar': '#0a0918e0', '--card': 'rgb(255 255 255 / .05)', '--chip': 'rgb(255 255 255 / .07)', '--foot': 'rgb(0 0 0 / .25)',
    '--text': '#f4f2ff', '--text-2': 'rgb(228 224 255 / .68)', '--line': 'rgb(167 139 250 / .14)', '--accent': '#b4a5ff',
    '--grad': 'linear-gradient(135deg, #a855f7, #6366f1 52%, #3b82f6)', '--on-grad': '#ffffff',
  };
}

/** The page's colours for this request's host. */
export const palette = (ctx: Ctx): Record<string, string> => paletteFor(ctx.host.salon);

/** "Who is responsible for your data" → "who-is-responsible-for-your-data": the same anchors in both languages. */
const slug = (title: string) => title.toLowerCase().replace(/\{brand\}/g, 'brand').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The privacy policy or the terms, on any host, in Arabic or (?lang=en) English. */
export function legalPage(ctx: Ctx, kind: LegalDoc): void {
  const lang: Lang = ctx.url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const doc = DOCS[kind][lang];
  const { salon, tenant } = ctx.host;
  const brand = lang === 'en' ? tenant.name : tenant.name_ar || tenant.name;
  const phone = tenant.contact_phone;
  const contact = phone ? `<a href="https://wa.me/${phone.slice(1)}" rel="noopener"><bdi dir="ltr">${escapeHtml(showPhone(phone))}</bdi></a>` : null;
  const salonName = salon ? (lang === 'en' && salon.name_en ? salon.name_en : salon.name_ar) : '';
  const fill: Fill = { brand: escapeHtml(brand), salon: escapeHtml(salonName), days: String(config.sessionDays), contact };
  // Without a contact number, the sentences that point to it are left out.
  const usable = (text: string) => contact !== null || !text.includes('{contact}');
  const block = (b: Block) => (Array.isArray(b)
    ? `<ul>${b.filter(usable).map((li) => `<li>${render(li, fill)}</li>`).join('')}</ul>`
    : usable(b) ? `<p>${render(b, fill)}</p>` : '');
  // Anchors come from the English titles, so a link to a section works in both languages.
  const ids = DOCS[kind].en.sections.map((s) => slug(s.title));
  const shown = doc.sections
    .map((s, i) => ({ id: ids[i]!, title: render(s.title, fill), html: s.body.map(block).join('') }))
    .filter((s) => s.html);
  const sections = shown
    .map((s) => `<section id="${s.id}" aria-labelledby="${s.id}-h"><h2 id="${s.id}-h">${s.title}</h2>${s.html}</section>`)
    .join('\n');
  const list = `<ol class="list">${shown.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ol>`;
  // The contents follow the reading: the section crossing a line near the top of the
  // screen lights its entry (scroll-driven, no script), and a jump lights its target.
  const spy = [
    ...shown.map((s) => `body:has(#${s.id}:target) .toc a[href="#${s.id}"]{color:var(--text);background:var(--chip)}`),
    `@supports (timeline-scope:--a) and (animation-timeline:--a){body{timeline-scope:${shown.map((_, i) => `--t${i}`).join(',')}}`,
    ...shown.map((s, i) => `#${s.id}{view-timeline:--t${i} block;view-timeline-inset:28% 71%}.toc a[href="#${s.id}"]{animation:toc-on linear;animation-timeline:--t${i}}`),
    '}',
  ].join('\n');

  const proto = requestProto(ctx.req, config.trustProxy);
  const port = ctx.host.port ? `:${ctx.host.port}` : '';
  const en = lang === 'en';
  const query = en ? '?lang=en' : '';
  // One address for search engines: the platform's own domain.
  const canonical = `${proto}://${tenant.domain}${port}/${kind}`;
  const t = (ar: string, english: string) => (en ? english : ar);
  const updated = new Intl.DateTimeFormat(en ? 'en-GB' : 'ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${UPDATED}T00:00:00Z`));
  const icon = salon ? `/icons/icon-192.png?v=${iconVersion(salon)}` : '/icons/icon-192.png';
  const homeName = escapeHtml(salon ? salonName : brand);
  const colors = palette(ctx);
  const langLink = `<a class="lang" href="/${kind}${en ? '' : '?lang=en'}" hreflang="${en ? 'ar' : 'en'}" lang="${en ? 'ar' : 'en'}">${SVG.globe}<span>${en ? 'العربية' : 'English'}</span></a>`;
  const html = `<!doctype html>
<html lang="${lang}" dir="${en ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(doc.title)} · ${homeName}</title>
<meta name="description" content="${render(doc.intro, { ...fill, contact: '' }).replace(/<[^>]+>/g, '')}">
<link rel="canonical" href="${canonical}${query}">
<link rel="alternate" hreflang="ar" href="${canonical}">
<link rel="alternate" hreflang="en" href="${canonical}?lang=en">
${salon || ctx.host.site === 'admin' ? '<meta name="robots" content="noindex">\n' : ''}<meta name="theme-color" content="${colors['--bg']}">
<link rel="icon" href="${icon}">
<style>${FONTS}
:root{${Object.entries(colors).map(([k, v]) => `${k}:${v}`).join(';')}}
${STYLE}
${spy}</style>
</head>
<body>
<header class="top">
<a class="brand" href="/" aria-label="${escapeHtml(t(`الرجوع إلى ${salon ? salonName : brand}`, `Back to ${salon ? salonName : brand}`))}">${SVG.back}<img src="${icon}" alt=""><span>${homeName}</span></a>
${langLink}
</header>
<div class="wrap">
<nav class="toc" aria-labelledby="toc-h"><p class="toc-h" id="toc-h">${t('في هذه الصفحة', 'On this page')}</p>${list}</nav>
<main>
<p class="updated">${t('آخر تحديث', 'Last updated')}: ${updated}</p>
<h1>${escapeHtml(doc.title)}</h1>
<p class="intro">${render(doc.intro, fill)}</p>
${salon ? `<p class="note">${render(doc.salonNote, fill)}</p>` : ''}
<details class="toc-m"><summary>${t('المحتويات', 'Contents')}</summary>${list}</details>
${sections}
</main>
</div>
<footer class="foot">
<div class="f-top">
<a class="f-brand" href="/"><img src="${icon}" alt=""><span>${homeName}</span></a>
<nav class="f-links" aria-label="${t('الصفحات', 'Pages')}"><a href="/privacy${query}"${kind === 'privacy' ? ' aria-current="page"' : ''}>${escapeHtml(DOCS.privacy[lang].title)}</a><a href="/terms${query}"${kind === 'terms' ? ' aria-current="page"' : ''}>${escapeHtml(DOCS.terms[lang].title)}</a><a href="/">${escapeHtml(salon ? t(`الرجوع إلى ${salonName}`, `Back to ${salonName}`) : t('الصفحة الرئيسية', 'Home'))}</a></nav>
</div>
<div class="f-bot"><span>© ${new Date().getUTCFullYear()} ${homeName}</span>${langLink}</div>
</footer>
</body>
</html>`;
  ctx.res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': lang,
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  ctx.res.end(ctx.req.method === 'HEAD' ? undefined : html);
}

// The platform's front door (the bare domain): "The Cover Issue". A luxury salon
// magazine whose cover star is the reader's own salon, in ink, bone paper and warm
// mirror-bulb light. Every colour on the page belongs to a salon; Salonak's own
// violet and blue show only in its small mark, the progress line and focus rings.
// Scenes are scrubbed from the scroll position by a small engine (rAF and CSS
// variables, transforms and opacity only); reduced motion gets a calm, complete page.

// §1 imports
import { appReady, clear, h, icon, legalLinks, salonIcon, scissorsMark } from '../dom.js';
import { dayName, fmtDuration, fmtPrice, fmtTime, getLang, pick, setLang, t } from '../i18n.js';
import { homeScreen, miniApp, phone, splashScreen } from '../preview.js';
import { brandVars, dayBase, nightBase } from '../theme.js';
import { PALETTES } from '../templates.js';
import { waNumber } from './booking.js';

// §2 COPY: the landing's own words (it is lazy-loaded on the bare domain only).
const COPY = {
  ar: {
    skip: 'تخطَّ إلى التواصل', skip_end: 'تخطَّ إلى النهاية', contact: 'تواصل معنا', lang: 'English', cta: 'اطلب تطبيق صالونك', soon: 'قريبًا.',
    wa_text: 'مرحبًا! بدي أعرف أكثر عن تطبيق لصالوني.', examples: 'الصالونات في هذه الصفحة أمثلة للتوضيح.',
    heads: { cover: ['01', 'الغلاف'], letter: ['02', 'كلمة العدد'], 'white-label': ['03', 'علامتك الخاصة'], collection: ['04', 'المجموعة'], try: ['04', 'المجموعة'], pocket: ['05', 'في جيب زبونك'], booking: ['06', 'الحجز'], backstage: ['07', 'خلف الكرسي'], how: ['08', 'البداية'], finale: ['09', 'غلافك'] },
    night: 'ليلي', day: 'نهاري', cliq: 'كليك',
    eyebrow: 'العدد 01 · للصالونات ومحلات الحلاقة في الأردن', mast: 'صالونك', sub: 'صار له تطبيق.',
    deck: 'تطبيق وصفحة حجز باسم صالونك، بشعاره وألوانه. زبائنك يحجزون بأنفسهم على مدار الساعة، والعربون يوصلك على كليك.',
    how_btn: 'كيف يشتغل', scroll: 'مرّر',
    cl: ['حجز جديد', 'وصل العربون', 'رابطه الخاص', 'علامتك الخاصة'], cl_wl: 'اسمك على الغلاف',
    letter: 'لكل صالون بصمته: ضوء مراياه، وألوانه، واسمه فوق الباب. زبائنك يعرفونه من أول نظرة. فليش يحجزون عندك على تطبيق يحمل اسم غيرك؟',
    letter_b: 'صالونك يستاهل تطبيقه الخاص.', sign: '— فريق', pun: 'سمّيناه «صالونك» لأنه فعلًا صالونك.', toc: 'في هذا العدد', quote: '”',
    wl_x: 'White label', wl_h2: ['اسمك على الغلاف.', 'واسمنا بالخط الصغير.'],
    wl_deck: 'كل صالون معنا يأخذ هويته كاملة: اسمه وشعاره وأيقونته وألوانه وشاشة افتتاحه وصورة غلافه ورابطه الخاص. زبونك يفتح تطبيق صالونك، ولا يرى منّا إلا سطرًا صغيرًا في الأسفل.',
    wl_labels: [
      ['الاسم والشعار', 'اسم صالونك وشعاره داخل حلقة الأضواء، أول ما يراه زبونك.'],
      ['ألوانك', 'اختر لونين أو لوحة من 13 لوحة جاهزة، وكل الدرجات تُشتق منها تلقائيًا وتبقى واضحة للقراءة.'],
      ['الغلاف والمظهر', 'صورة صالونك أعلى الصفحة، بمظهر ليلي فخم أو نهاري مشرق.'],
      ['أيقونة التطبيق', 'أيقونة صالونك على شاشة جوال زبونك بين تطبيقاته. نصنعها من شعارك، أو ارفع أيقونة خاصة.'],
      ['شاشة الافتتاح', 'كل مرة يُفتح التطبيق: أيقونتك بحلقة أضواء واسم صالونك، بألوانك.'],
      ['رابطك الخاص', 'اسم صالونك قبل {domain}، جاهز للبايو والواتساب.'],
      ['معاينة الرابط', 'لما ينبعت رابطك بأي محادثة، يظهر باسم صالونك وصورته.'],
      ['لوحتك بألوانك', 'حتى لوحة الإدارة على جوالك تلبس ألوان صالونك، إذا حبيت.'],
    ],
    wl_go: 'انتقل إلى {name}', mag: 'هذا كل اللي يشوفه زبونك منّا.', today_n: 'اليوم · 4 مواعيد',
    co_h2: ['كل صالون،', 'بشكله.'], co_deck: 'نفس النظام القوي من الداخل، وهوية مختلفة تمامًا من الخارج. هذه صالونات من خيالنا، وصالونك هو التالي.',
    types: { ladies: 'صالون نسائي', barber: 'حلاقة رجالية', nails: 'أظافر وعناية' }, sw: ['اللون الأساسي', 'لون التمييز'],
    swipe: 'اسحب', prev: 'السابق', next: 'التالي',
    try_kicker: 'صالونك هنا', try_h3: 'جرّبها على صالونك.', try_sub: 'اكتب اسم صالونك، واختر ألوانه وشكل صفحته، وشوف تطبيقه يتغيّر قدامك.',
    try_name: 'اسم صالونك', try_ph: 'مثلًا: صالون الياسمين', try_colours: 'ألوان صالونك', try_look: 'شكل الصفحة',
    try_cap: 'صالونك باللون: {palette} · {look}', try_foot: 'نفس اللوحات اللي بلوحة إدارتك، أو أي لونين بتختارهم.', try_about: 'خدماتك وأسعارك',
    pk_h2: ['من رابط بالبايو…', 'لأيقونة على شاشة زبونك.'],
    pk_deck: 'بدون متجر تطبيقات وبدون تنزيل. زبونك يفتح رابطك ويضيفه لشاشته الرئيسية، فيصير صالونك تطبيقًا على جواله، بأيقونتك.',
    pk_steps: [
      ['شارك رابطك', 'بالبايو وعلى الواتساب وعلى مراية الصالون، ويوصل باسم صالونك وصورته.'],
      ['زبونك يفتح صفحتك', 'خدماتك وأسعارك وفريقك وأوقات دوامك، بهوية صالونك.'],
      ['يضيفها لشاشته الرئيسية', 'بخطوات بسيطة من المتصفح، وتصير أيقونتك بين تطبيقاته.'],
      ['ويفتحها كتطبيق', 'شاشة افتتاح بأيقونتك وألوانك، وبعدها الحجز مباشرة.'],
    ],
    chat_c: 'مرحبا، بدي أحجز قصّة لبكرة', chat_s: 'أهلين! احجز من هون 👇',
    bk_h2: ['حجز كامل،', 'بدون ولا مكالمة.'], bk_deck: 'زبونك يحجز بنفسه بأي ساعة، حتى والصالون مسكّر، والمواعيد تمشي حسب دوامك ودوام كل موظف.',
    tag_c: 'عند الزبون', tag_s: 'عند الصالون',
    frames: [
      ['الخدمة', 'خدماتك بأسعارها ومدّتها، واضحة حتى الساعة وحدة بالليل.'],
      ['مع مين؟', 'يختار الموظف، أو «أي شخص متاح» لأقرب موعد.'],
      ['الوقت', 'يظهر له المتاح بس، فما في حجزين على نفس الموعد.'],
      ['العربون عبر كليك', 'يحوّل العربون لاسمك المستعار ويرفع صورة الحوالة، وموعده محجوز له خلال المهلة اللي بتحددها.'],
      ['عند الصالون', 'الحجز وصورة الحوالة يظهرون على لوحتك فورًا. تتأكد من تطبيق البنك، وتوافق بلمسة.'],
      ['تأكّد الموعد', 'زبونك يشوف التأكيد على رابط حجزه، وأنت تشوفه بجدول اليوم.'],
    ],
    bk_note: 'العربون اختياري: بدونه يتأكد الحجز فورًا.', bk_q: 'بدك هيك لصالونك؟', bk_a: 'احكي معنا', today: 'اليوم', tomorrow: 'غدًا', senior: 'حلاق أول',
    bs_h2: ['صالونك كله،', 'على جوالك.'],
    bs_deck: 'لوحة إدارة تتثبّت على جوالك كتطبيق بأيقونة صالونك. الحجوزات الجديدة تظهر عليها أول بأول بدون ما تحدّث الصفحة، وحوالات كليك تراجعها وتأكدها بلمسة.',
    bs_pills: ['بنفسجي وأزرق', 'ألوان صالونك'], bs_cap: 'لوحتك بألوان الاستوديو أو بألوان صالونك، أنت تختار.',
    bs_table: [
      ['جدول اليوم', 'مين جاي وإيمتى ومع مين، واللي بانتظار تأكيد العربون بأول القائمة.'],
      ['حجز تضيفه بنفسك', 'زبون اتصل أو دخل الصالون؟ سجّل موعده بنفس الجدول، بدون تضارب.'],
      ['الخدمات والفريق والدوام', 'عدّل الأسعار والمدد والموظفين وأوقات العمل، حتى أكثر من فترة باليوم ودوام خاص لكل موظف.'],
      ['عربي وإنجليزي', 'صفحتك ولوحتك باللغتين، وكل واحد يختار لغته.'],
    ],
    bs_sheet: 'صور فريق متناسقة', styles: ['طبيعي', 'دافئ', 'أبيض وأسود', 'بلون الصالون'], live: 'مباشر', new_b: 'حجز جديد',
    nav: ['الرئيسية', 'المواعيد', 'الخدمات', 'الفريق', 'الأوقات', 'الهوية'],
    rows: [['ليث', 'قص شعر', '12:15'], ['سامي', 'قص ولحية', '16:30'], ['عمر', 'تشذيب لحية', '18:00'], ['يزن', 'قص ولحية', '18:30']],
    how_h2: ['ثلاث خطوات', 'وبتبلّش.'],
    how_steps: [
      ['احكي معنا', 'على واتساب. نفتح لك صالونك، ونبعتلك رابطه وكلمة مرور لوحة الإدارة.'],
      ['جهّز صالونك', 'ضيف خدماتك وأسعارك وفريقك ودوامك وشعارك وألوانك، كله من جوالك.'],
      ['شارك الرابط', 'حطّه بالبايو وعلى الواتساب، وابدأ تستقبل الحجوزات.'],
    ],
    // Without a contact number there is no WhatsApp to promise.
    how_1_soon: ['تواصل معنا', 'نفتح لك صالونك، ونبعتلك رابطه وكلمة مرور لوحة الإدارة.'],
    fn_h2: ['جاهز يكون صالونك', 'على الغلاف؟'], fn_deck: 'احكي معنا على واتساب، ونجهّز تطبيق صالونك باسمه وألوانه.', logo_here: 'شعارك هنا',
    fn_deck_soon: 'نجهّز تطبيق صالونك باسمه وألوانه.',
    col_line: 'تطبيقات وحجوزات للصالونات ومحلات الحلاقة في الأردن.', owner: 'عندك صالون معنا؟ لوحة إدارتك على رابط صالونك وبعده {path}',
  },
  en: {
    skip: 'Skip to contact', skip_end: 'Skip to the end', contact: 'Contact us', lang: 'العربية', cta: "Get your salon's app", soon: 'Coming soon.',
    wa_text: "Hi! I'd like to know more about an app for my salon.", examples: 'The salons on this page are examples.',
    heads: { cover: ['01', 'Cover'], letter: ['02', "Editor's letter"], 'white-label': ['03', 'White label'], collection: ['04', 'The collection'], try: ['04', 'The collection'], pocket: ['05', 'In their pocket'], booking: ['06', 'Booking'], backstage: ['07', 'Behind the chair'], how: ['08', 'Getting started'], finale: ['09', 'Your cover'] },
    night: 'Night', day: 'Day', cliq: 'CliQ',
    eyebrow: 'Issue 01 · For salons and barbershops in Jordan', mast: 'Your salon', sub: 'now has its own app.',
    deck: "An app and a booking page in your salon's name, with its logo and colours. Customers book themselves around the clock, and deposits reach you by CliQ.",
    how_btn: 'How it works', scroll: 'Scroll',
    cl: ['New booking', 'Deposit received', 'Its own link', 'White label'], cl_wl: 'Your name on the cover',
    letter: "Every salon has a signature: the light of its mirrors, its colours, the name above its door. Your customers know it at a glance. So why should they book with you in an app that carries someone else's name?",
    letter_b: 'Your salon deserves an app of its own.', sign: '— The', sign_after: 'team', pun: 'We named it {brand}, Arabic for “your salon”, because it really is yours.', toc: 'In this issue', quote: '“',
    wl_x: '', wl_h2: ['Your name on the cover.', 'Ours in the fine print.'],
    wl_deck: "Every salon with us gets its whole identity: its name, logo, app icon, colours, launch screen, cover photo and its own link. Your customers open your salon's app and see nothing of us but one small line at the bottom.",
    wl_labels: [
      ['Name and logo', "Your salon's name and logo inside the ring of lights: the first thing customers see."],
      ['Your colours', 'Pick two colours or one of 13 ready palettes; every shade follows from them and stays easy to read.'],
      ['Cover and look', "Your salon's photo across the top, in a rich night look or a bright day look."],
      ['App icon', "Your salon's icon on your customer's home screen, among their apps. Made from your logo, or upload your own."],
      ['Launch screen', "Every time the app opens: your icon in a ring of lights and your salon's name, in your colours."],
      ['Your own link', "Your salon's name before {domain}, ready for your bio and WhatsApp."],
      ['Link preview', "Send your link in any chat and it shows your salon's name and picture."],
      ['Your dashboard, your colours', "Even the dashboard on your phone can wear your salon's colours, if you like."],
    ],
    wl_go: 'Go to {name}', mag: "That's all your customers see of us.", today_n: 'Today · 4 bookings',
    co_h2: ['Every salon,', 'in its own look.'], co_deck: 'The same strong system inside, a completely different identity outside. These salons are imaginary; yours is next.',
    types: { ladies: "Ladies' salon", barber: 'Barbershop', nails: 'Nails and care' }, sw: ['Main colour', 'Accent colour'],
    swipe: 'Swipe', prev: 'Previous', next: 'Next',
    try_kicker: 'Your salon here', try_h3: 'Try it on your salon.', try_sub: "Type your salon's name, pick its colours and its look, and watch its app change in front of you.",
    try_name: "Your salon's name", try_ph: 'e.g. Jasmine Salon', try_colours: "Your salon's colours", try_look: 'Page look',
    try_cap: 'Your salon in: {palette} · {look}', try_foot: 'The same palettes as in your dashboard, or any two colours you choose.', try_about: 'Your services and prices',
    pk_h2: ['From a link in your bio…', 'to an icon on their home screen.'],
    pk_deck: 'No app store, no download. Customers open your link and add it to their home screen, and your salon becomes an app on their phone, with your icon.',
    pk_steps: [
      ['Share your link', "In your bio, on WhatsApp, on the salon mirror. It arrives with your salon's name and picture."],
      ['They open your page', "Your services, prices, team and hours, in your salon's identity."],
      ['They add it to their home screen', 'A few taps in the browser, and your icon sits among their apps.'],
      ['And open it like an app', 'A launch screen with your icon and colours, then straight to booking.'],
    ],
    chat_c: 'Hi, can I book a haircut for tomorrow?', chat_s: 'Hello! Book here 👇',
    bk_h2: ['A full booking.', 'Not a single call.'], bk_deck: "Customers book themselves at any hour, even while the salon is closed, and times follow your hours and each team member's.",
    tag_c: 'Customer', tag_s: 'At the salon',
    frames: [
      ['The service', 'Your services with prices and durations, clear even at one in the morning.'],
      ['With whom?', 'They pick a team member, or “Anyone available” for the earliest time.'],
      ['The time', 'Only free times show, so two bookings never land on one slot.'],
      ['CliQ deposit', 'They send the deposit to your CliQ alias and upload the screenshot; their time is held for the window you set.'],
      ['At the salon', 'The booking and the screenshot appear on your dashboard straight away. Check your bank app, then approve with one tap.'],
      ['Confirmed', "Your customer sees the confirmation on their booking link, and you see it in today's schedule."],
    ],
    bk_note: 'Deposits are optional: without one, bookings confirm instantly.', bk_q: 'Want this for your salon?', bk_a: 'Message us', today: 'Today', tomorrow: 'Tomorrow', senior: 'Senior barber',
    bs_h2: ['Your whole salon,', 'on your phone.'],
    bs_deck: "A dashboard that installs on your phone like an app, with your salon's icon. New bookings appear as they happen, no refresh needed, and you check CliQ screenshots and confirm them with a tap.",
    bs_pills: ['Violet and blue', "Your salon's colours"], bs_cap: "Your dashboard in the studio's colours or your salon's own; you choose.",
    bs_table: [
      ["Today's schedule", "Who's coming, when and with whom, with deposits waiting for you at the top."],
      ['Bookings you add yourself', 'A customer called or walked in? Add them to the same schedule, with no clashes.'],
      ['Services, team and hours', "Change prices, durations, staff and hours, including split shifts and each person's own hours."],
      ['Arabic and English', 'Your page and your dashboard in both languages; everyone picks their own.'],
    ],
    bs_sheet: 'Team photos that match', styles: ['Natural', 'Warm', 'Black & white', 'Salon colour'], live: 'Live', new_b: 'New booking',
    nav: ['Home', 'Bookings', 'Services', 'Team', 'Hours', 'Brand'],
    rows: [['Laith', 'Haircut', '12:15'], ['Sami', 'Cut and beard', '16:30'], ['Omar', 'Beard trim', '18:00'], ['Yazan', 'Cut and beard', '18:30']],
    how_h2: ['Three steps', 'to start.'],
    how_steps: [
      ['Message us', 'On WhatsApp. We open your salon and send you its link and your dashboard password.'],
      ['Set up your salon', 'Add your services, prices, team, hours, logo and colours, all from your phone.'],
      ['Share the link', 'Put it in your bio and on WhatsApp, and start taking bookings.'],
    ],
    how_1_soon: ['Get in touch', 'We open your salon and send you its link and your dashboard password.'],
    fn_h2: ['Ready to put your salon', 'on the cover?'], fn_deck: "Message us on WhatsApp and we'll set up your salon's app, in its name and colours.", logo_here: 'Your logo here',
    fn_deck_soon: "We'll set up your salon's app, in its name and colours.",
    col_line: 'Apps and bookings for salons and barbershops in Jordan.', owner: "Already with us? Your dashboard is your salon's link followed by {path}",
  },
};
const tx = (key, vars) => {
  let s = COPY[getLang()]?.[key] ?? COPY.ar[key];
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
};
// A Latin address (or path) kept in one left-to-right piece inside Arabic text.
const ltr = (s) => `⁦${s}⁩`;
const pad = (n) => String(n).padStart(2, '0');

// §3 CAST (fictional example salons) and TRY (the visitor's own)
const ALWAYS_OPEN = Array.from({ length: 7 }, () => [{ open: '00:00', close: '24:00' }]);
const svc = (e, ar, en, min, price) => ({ icon: e, name_ar: ar, name_en: en, duration_min: min, price, active: true });
const salon = (o) => ({ ...o, vars: brandVars(o.primary, o.accent) });
const CAST = {
  lamar: salon({
    sub: 'lamar', name_ar: 'صالون لمار', name_en: 'Lamar Salon', about_ar: 'شعر، مكياج وعناية', about_en: 'Hair, makeup and care', type: 'ladies', look: 'night',
    primary: '#5b2245', accent: '#e8b4c8', icon_bg: 'primary', mark: 'flower', fg: '#e8b4c8', fg2: '#fff3f7', deposit: 5, at: '10:30',
    services: [svc('✂️', 'قص وسشوار', 'Cut and blow-dry', 60, 15), svc('🎨', 'صبغة كاملة', 'Full colour', 120, 45), svc('💄', 'مكياج سهرة', 'Evening makeup', 60, 35)],
    staff: [['ليلى', 'Layla', 'long'], ['هبة', 'Hiba', 'bun']],
  }),
  barber: salon({
    sub: 'barber-house', name_ar: 'بيت الحلاقة', name_en: 'Barber House', about_ar: 'قصّات ولحية على أصولها', about_en: 'Cuts and beards, done right', type: 'barber', look: 'night',
    primary: '#1d2b36', accent: '#d4a24c', icon_bg: 'night', mark: 'pole', fg: '#d4a24c', fg2: '#f2ede4', deposit: 2, at: '18:00',
    services: [svc('✂️', 'قص شعر', 'Haircut', 30, 7), svc('🧔', 'تشذيب لحية', 'Beard trim', 20, 4), svc('💈', 'قص ولحية', 'Cut and beard', 45, 10)],
    staff: [['فهد', 'Fahd', 'beard'], ['سامي', 'Sami', 'short']],
  }),
  rana: salon({
    sub: 'rana-nails', name_ar: 'أظافر رنا', name_en: 'Rana Nails', about_ar: 'مناكير وبديكير وتركيب', about_en: 'Manicure, pedicure and extensions', type: 'nails', look: 'night',
    primary: '#2b2a63', accent: '#8fe3d2', icon_bg: 'white', mark: 'drop', fg: '#2b2a63', fg2: '#5fc9b4', deposit: 5, at: '13:15',
    services: [svc('💅', 'مناكير جل', 'Gel manicure', 45, 12), svc('✨', 'بديكير', 'Pedicure', 50, 15), svc('💎', 'تركيب أظافر', 'Nail extensions', 90, 25)],
    staff: [['رنا', 'Rana', 'long'], ['دانة', 'Dana', 'bob']],
  }),
  joud: salon({
    sub: 'joud-studio', name_ar: 'استوديو جود', name_en: 'Joud Studio', about_ar: 'شعر وبشرة بلمسة هادئة', about_en: 'Hair and skin, gently done', type: 'ladies', look: 'day',
    primary: '#efe6d8', accent: '#8a5a44', icon_bg: 'primary', mark: 'arches', fg: '#8a5a44', fg2: '#c4977a', deposit: 5, at: '11:00',
    services: [svc('💇‍♀️', 'قص شعر', 'Haircut', 45, 14), svc('✨', 'استشوار', 'Blow-dry', 45, 10), svc('🌿', 'كيراتين', 'Keratin', 180, 60)],
    staff: [['جود', 'Joud', 'bun'], ['سلمى', 'Salma', 'long']],
  }),
  corner: salon({
    sub: 'corner-barber', name_ar: 'حلاق الحيّ', name_en: 'The Corner Barber', about_ar: 'قصّات كلاسيكية وحلاقة بالموس', about_en: 'Classic cuts and hot-towel shaves', type: 'barber', look: 'day',
    primary: '#0e3b36', accent: '#d9b45a', icon_bg: 'primary', mark: 'comb', fg: '#d9b45a', fg2: '#f2ede4', deposit: 2, at: '17:30',
    services: [svc('✂️', 'قص شعر', 'Haircut', 30, 6), svc('🪒', 'حلاقة بالموس', 'Hot towel shave', 30, 5), svc('💈', 'قص شعر مع ذقن', 'Haircut & beard', 45, 9)],
    staff: [['يزن', 'Yazan', 'beard'], ['عمر', 'Omar', 'short']],
  }),
};
const TRY_PALETTES = ['violet', 'ocean', 'gold', 'emerald', 'burgundy', 'coral', 'rose', 'lavender'];
const TRY_SERVICES = [svc('✂️', 'قص شعر', 'Haircut', 30, 8), svc('✨', 'سشوار', 'Blow-dry', 45, 10), svc('🎨', 'صبغة شعر', 'Hair colour', 120, 35)];
const TILE = { primary: 'var(--primary)', night: 'var(--night)', white: '#fff' };

// §4 art: SVG data URIs (presentation attributes only), built once per salon.
const ART = new Map();
const art = (key, w, hh, body) => {
  if (!ART.has(key)) ART.set(key, `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}">${body()}</svg>`)}`);
  return ART.get(key);
};
const n1 = (v) => v.toFixed(1);

/** The salon's geometric mark, in the colour that reads on its icon background. */
function markSvg(s) {
  const { fg, fg2 } = s;
  return art(`m-${s.sub}`, 128, 128, () => {
    if (s.mark === 'flower') {
      return [0, 1, 2, 3, 4].map((k) => `<ellipse cx="64" cy="38" rx="15" ry="25" fill="${fg}" transform="rotate(${k * 72} 64 64)"/>`).join('')
        + `<circle cx="64" cy="64" r="12" fill="${fg2}"/><circle cx="64" cy="64" r="5" fill="${fg}"/>`;
    }
    if (s.mark === 'pole') {
      const stripes = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => `<rect x="10" y="${60 + k * 20}" width="108" height="9" fill="${fg}" transform="rotate(-32 64 64)"/>`).join('');
      return `<defs><clipPath id="c"><rect x="46" y="24" width="36" height="80" rx="18"/></clipPath></defs><rect x="46" y="24" width="36" height="80" rx="18" fill="${fg2}"/>`
        + `<g clip-path="url(#c)">${stripes}</g><rect x="40" y="12" width="48" height="14" rx="7" fill="${fg}"/><rect x="40" y="102" width="48" height="14" rx="7" fill="${fg}"/>`;
    }
    if (s.mark === 'drop') {
      return `<path d="M38 114V60C38 30 50 14 64 14S90 30 90 60V114Z" fill="${fg}"/><path d="M38 94Q64 80 90 94" stroke="${fg2}" stroke-width="6" fill="none" stroke-linecap="round"/>`
        + `<path d="M52 56C52 40 57 31 64 28" stroke="${fg2}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    }
    if (s.mark === 'arches') {
      return `<path d="M22 112V58a26 26 0 0 1 52 0V112" fill="none" stroke="${fg}" stroke-width="9" stroke-linecap="round"/>`
        + `<path d="M54 112V58a26 26 0 0 1 52 0V112" fill="none" stroke="${fg2}" stroke-width="9" stroke-linecap="round"/>`;
    }
    const teeth = Array.from({ length: 11 }, (_, k) => `<rect x="${23 + k * 8}" y="54" width="4.5" height="${k % 2 ? 28 : 38}" rx="2.2" fill="${fg}"/>`).join('');
    return `<rect x="18" y="34" width="92" height="24" rx="8" fill="${fg}"/><rect x="26" y="42" width="76" height="4" rx="2" fill="${fg2}" opacity=".5"/>${teeth}`;
  });
}

/** A cover photo drawn for the salon: three lit mirror arches over its colours. */
function coverSvg(s) {
  return art(`c-${s.sub}`, 600, 320, () => {
    const v = s.vars;
    const day = s.look === 'day';
    const top = day ? dayBase(s.primary) : s.primary;
    const bot = day ? s.primary : nightBase(s.primary);
    const arch = (cx) => {
      const r = 56;
      const y0 = 300;
      const cy = 140;
      const bulbs = Array.from({ length: 7 }, (_, k) => {
        const a = Math.PI - (k * Math.PI) / 6;
        const x = n1(cx + r * Math.cos(a));
        const y = n1(cy - r * Math.sin(a));
        return `<circle cx="${x}" cy="${y}" r="10" fill="#ffe2b0" opacity=".25"/><circle cx="${x}" cy="${y}" r="4" fill="#ffe2b0"/>`;
      }).join('');
      return `<path d="M${cx - r} ${y0}V${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}V${y0}Z" fill="${v['--primary-lift']}" fill-opacity=".18" stroke="${v['--accent-lift']}" stroke-width="2"/>${bulbs}`;
    };
    return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`
      + `<radialGradient id="f" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="${v['--accent-lift']}" stop-opacity=".45"/><stop offset="1" stop-color="${v['--accent-lift']}" stop-opacity="0"/></radialGradient></defs>`
      + `<rect width="600" height="320" fill="url(#g)"/><rect y="170" width="600" height="150" fill="url(#f)"/>${arch(150)}${arch(300)}${arch(450)}`
      + `<rect y="300" width="600" height="20" fill="${bot}"/><rect y="299" width="600" height="1.5" fill="${v['--accent-lift']}" opacity=".5"/>`;
  });
}

/** A head-and-shoulders portrait, in one of the studio-touch styles. */
function portraitSvg(style, s, hair) {
  return art(`p-${style}-${s.sub}-${hair}`, 120, 150, () => {
    const v = s.vars;
    const P = {
      natural: { bg: v['--night'], bg2: s.look === 'day' ? s.primary : v['--primary-lift'], skin: '#c98e6b', shade: '#a8714f', hair: '#2a1d17', cloth: '#3b3540' },
      warm: { bg: '#a8641f', bg2: '#e6a95c', skin: '#d79a6a', shade: '#b97a4e', hair: '#3a2418', cloth: '#5a3220' },
      mono: { bg: '#29282c', bg2: '#5a595f', skin: '#a3a1a6', shade: '#86848a', hair: '#2f2e33', cloth: '#4d4c52' },
      brand: { bg: v['--night'], bg2: v['--accent-lift'], skin: v['--accent-lift'], shade: v['--accent-lift'], hair: v['--night'], cloth: v['--accent-lift'] },
    }[style];
    const back = hair === 'long' ? `<path d="M33 70C30 40 44 29 60 29S90 40 87 70L92 118C78 126 42 126 28 118Z" fill="${P.hair}"/>`
      : hair === 'bob' ? `<path d="M34 70C32 42 45 30 60 30S88 42 86 70L88 96C76 102 44 102 32 96Z" fill="${P.hair}"/>` : '';
    const top = {
      short: `<path d="M37 62C36 41 48 34 61 34C75 34 85 42 83 60C79 51 70 47 60 48C50 48 41 53 37 62Z" fill="${P.hair}"/>`,
      beard: `<path d="M37 60C36 41 48 34 61 34C75 34 85 42 83 58C79 50 70 46 60 47C50 47 41 52 37 60Z" fill="${P.hair}"/><path d="M39 66C41 86 51 95 60 95S79 86 81 66C76 76 68 80 60 80S44 76 39 66Z" fill="${P.hair}"/>`,
      bun: `<circle cx="60" cy="30" r="11" fill="${P.hair}"/><path d="M37 62C36 41 48 35 61 35C75 35 85 43 83 60C78 50 70 46 60 46C50 46 41 52 37 62Z" fill="${P.hair}"/>`,
      long: `<path d="M38 60C40 42 50 37 61 37C73 37 82 44 82 58C75 48 67 45 58 46C49 47 42 52 38 60Z" fill="${P.hair}"/>`,
      bob: `<path d="M38 60C40 42 50 37 61 37C73 37 82 44 82 58C75 48 67 45 58 46C49 47 42 52 38 60Z" fill="${P.hair}"/>`,
    }[hair];
    const op = style === 'brand' ? ' opacity=".9"' : '';
    return `<defs><radialGradient id="b" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="${P.bg2}" stop-opacity=".55"/><stop offset="1" stop-color="${P.bg}" stop-opacity="0"/></radialGradient></defs>`
      + `<rect width="120" height="150" fill="${P.bg}"/><rect width="120" height="150" fill="url(#b)"/>${back}`
      + `<path d="M8 150C12 120 36 106 60 106S108 120 112 150Z" fill="${P.cloth}"${op}/><rect x="51" y="84" width="18" height="26" rx="7" fill="${P.shade}"/>`
      + `<ellipse cx="60" cy="64" rx="22" ry="27" fill="${P.skin}"/>${top}`;
  });
}

const salonData = (s, over = {}) => ({
  name_ar: s.name_ar, name_en: s.name_en, about_ar: s.about_ar, about_en: s.about_en, logo_url: s.mark ? markSvg(s) : null, cover_url: s.mark ? coverSvg(s) : null,
  icon_url: null, icon_bg: s.icon_bg, page_theme: s.look, currency: 'JOD', timezone: 'Asia/Amman', ...over,
});
const staffData = (s, style = 'natural') => s.staff.map(([ar, en, hair]) => ({ name_ar: ar, name_en: en, photo_url: portraitSvg(style, s, hair), active: true }));
const salonApp = (s, over, team = true) => miniApp({ salon: salonData(s, over), services: s.services, staff: team ? staffData(s) : [], hours: ALWAYS_OPEN });

/** The salon's colours on an element, through the CSSOM. */
function paint(el, primary, accent, tile) {
  for (const [k, v] of Object.entries(brandVars(primary, accent))) el.style.setProperty(k, v);
  if (tile) el.style.setProperty('--l-tile', tile);
  el.classList.add('l-painted');
  return el;
}
const paintSalon = (el, s) => paint(el, s.primary, s.accent, TILE[s.icon_bg]);

/** "صالونك" as the platform: its mark and name together. */
const lockup = (brand, cls = '') => h('span', { class: `l-lock ${cls}` }, h('span', { class: 'app-icon studio-mark' }, icon('sparkles')), h('span', { class: 'nm', text: brand }));
function powered(brand) {
  const [a, b] = t('pub.powered', { brand: '\u0001' }).split('\u0001');
  return h('span', { class: 'l-powered' }, a, lockup(brand), b);
}
const linkPill = (sub, domain, cls = '') => {
  const subEl = h('b', { text: sub });
  const el = h('div', { class: `l-link ${cls}`, dir: 'ltr' }, icon('lock'), h('span', null, subEl, h('span', { text: `.${domain}` })));
  el.sub = subEl;
  return el;
};
/** A ring of bulbs in three interleaved groups (so twinkle costs three layers). */
function bulbRing(n, xs, cls = '') {
  const groups = [0, 1, 2].map((g) => h('span', { class: `l-bulbs g${g} ${cls}` }));
  const all = [];
  for (let i = 0; i < n; i++) {
    const b = h('i', { style: { '--a': `${n1((-i * 360 * xs) / n)}deg`, '--i': String(i) } });
    all.push(b);
    groups[i % 3].append(b);
  }
  return { groups, all };
}
const folio = (text, extra) => h('p', { class: 'l-folio' }, h('span', { text }), extra ? h('span', { class: 'x', lang: 'en', text: extra }) : null);
const heading = (tag, [a, b], cls = '') => h(tag, { class: `l-h2 ${cls}` }, h('span', { class: 'a', text: a }), ' ', h('span', { class: 'b', text: b }));
const folioText = (id) => {
  const [n, name] = tx('heads')[id];
  return `${n} · ${name}`;
};

// §5 engine: SCRUB SPACE, TRIGGER STORY.
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const seg = (p, a, b) => clamp((p - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const mq = (q) => matchMedia(q).matches;
const SVH = (() => {
  try {
    return CSS.supports('height', '100svh') ? 'svh' : 'vh';
  } catch {
    return 'vh';
  }
})();

function motionMode() {
  try {
    if (mq('(prefers-reduced-motion: reduce)') || mq('(max-height: 500px) and (pointer: coarse)')) return 'still';
    if (!('IntersectionObserver' in window) || !('ResizeObserver' in window) || !CSS.supports('position', 'sticky')) return 'still';
    if (navigator.connection?.saveData) return 'lite';
    const mem = navigator.deviceMemory;
    if (mem !== undefined && mem <= 4 && (navigator.hardwareConcurrency || 8) <= 4) return 'lite';
  } catch {
    return 'still';
  }
  return 'full';
}

/** Sums offsetLeft/offsetTop up to an ancestor: layout geometry, untouched by transforms. */
function offIn(el, anc) {
  let x = 0;
  let y = 0;
  for (let e = el; e && e !== anc; e = e.offsetParent) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y };
}

function createEngine(view, mode) {
  const scenes = [];
  const marks = [];
  const live = new Set();
  const offs = [];
  const timers = new Set();
  const observers = [];
  const pointers = [];
  let raf = 0;
  let stopped = false;
  let vw = innerWidth;
  let vh = innerHeight;
  let lastW = vw;
  let lastH = vh;
  let rt = 0;
  let lastScroll = 0;
  let lastFrame = 0;
  const samples = [];
  const eng = {
    mode, scenes, marks, docH: 1, vw, vh, chrome: () => {}, onLite: [], onError: null,
    get stopped() {
      return stopped;
    },
  };
  const on = (tg, ev, fn, opt) => {
    tg.addEventListener(ev, fn, opt);
    offs.push(() => tg.removeEventListener(ev, fn, opt));
  };
  eng.on = on;
  const write = (el, k, v) => {
    if (Array.isArray(el)) for (const e of el) e.style.setProperty(k, v);
    else el.style.setProperty(k, v);
  };
  eng.add = (s) => {
    Object.assign(s, { rigs: s.rigs ?? [], top: 0, h: 1, p: -1, beat: s.beat ?? -1 });
    scenes.push(s);
    return s;
  };
  eng.mark = (el, id, tone, pin) => marks.push({ el, id, tone, pin, top: 0, h: 1 });
  eng.every = (ms, fn) => {
    const id = setInterval(fn, ms);
    timers.add(id);
    return id;
  };
  eng.after = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  eng.clear = (id) => {
    clearInterval(id);
    clearTimeout(id);
    timers.delete(id);
  };
  eng.observe = (obs) => {
    observers.push(obs);
    return obs;
  };
  /** Fires fn once when el is `at` visible (immediately when there is no motion). */
  eng.once = (el, fn, at = 0.3) => {
    if (mode === 'still' || !('IntersectionObserver' in window)) return fn();
    const io = eng.observe(new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    }, { threshold: at }));
    io.observe(el);
    return undefined;
  };
  eng.pointer = (scene, targets) => pointers.push({ scene, targets });
  eng.isLive = (s) => live.has(s);

  function run(s, y, force) {
    const a = s.kind === 'view' ? s.top - vh : s.top;
    const b = s.kind === 'view' ? s.top + s.h : s.top + s.h - vh;
    const p = clamp((y - a) / Math.max(1, b - a));
    if (!force && Math.abs(p - s.p) < 5e-4) return;
    s.p = p;
    for (const r of s.rigs) {
      const v = r.v(p);
      if (!(Math.abs(v - r.lv) < 1e-3)) {
        r.lv = v;
        write(r.el, '--v', v.toFixed(3));
      }
      if (r.w) {
        const w = r.w(p);
        if (!(Math.abs(w - r.lw) < 1e-3)) {
          r.lw = w;
          write(r.el, '--w', w.toFixed(3));
        }
      }
    }
    if (s.beats) {
      let i = 0;
      while (i < s.beats.length && p >= s.beats[i]) i++;
      if (i !== s.beat) {
        const was = s.beat;
        s.beat = i;
        s.onBeat(i, was);
      }
    }
    s.onP?.(p);
  }
  function guard(now) {
    if (view.dataset.motion !== 'full') return;
    if (now - lastScroll > 160) {
      lastFrame = 0;
      return;
    }
    if (lastFrame && now - lastFrame < 100) samples.push(now - lastFrame);
    lastFrame = now;
    if (samples.length < 90) return;
    const sorted = samples.splice(0).sort((x, z) => x - z);
    if (sorted[45] > 22) {
      view.dataset.motion = 'lite';
      eng.mode = 'lite';
      for (const fn of eng.onLite) fn();
    }
  }
  function frame(now) {
    raf = 0;
    if (stopped) return;
    const y = scrollY;
    vh = innerHeight;
    for (const s of live) run(s, y);
    eng.chrome(y, vh);
    guard(now);
  }
  const kick = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(frame);
  };
  eng.kick = kick;

  function measure() {
    if (stopped || !view.isConnected) return;
    try {
      vw = innerWidth;
      vh = innerHeight;
      lastW = vw;
      lastH = vh;
      eng.vw = vw;
      eng.vh = vh;
      for (const s of scenes) s.measure?.(vw, vh);
      const sy = scrollY;
      for (const s of scenes) {
        s.top = s.el.getBoundingClientRect().top + sy;
        s.h = s.el.offsetHeight;
        s.p = -1;
      }
      for (const m of marks) {
        m.top = m.el.getBoundingClientRect().top + sy;
        m.h = m.el.offsetHeight;
      }
      eng.docH = document.scrollingElement.scrollHeight;
      // Scenes off screen rest at their clamped ends.
      for (const s of scenes) if (!live.has(s)) run(s, sy, true);
      kick();
    } catch (err) {
      eng.onError?.(err);
    }
  }
  eng.measure = measure;

  eng.start = () => {
    on(window, 'scroll', () => {
      lastScroll = performance.now();
      kick();
    }, { passive: true });
    on(window, 'resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
        measure();
      }, 150);
    }, { passive: true });
    on(window, 'orientationchange', () => eng.after(250, measure));
    on(document, 'visibilitychange', () => view.classList.toggle('is-hidden', document.hidden));
    let roT = 0;
    const ro = eng.observe(new ResizeObserver(() => {
      clearTimeout(roT);
      roT = setTimeout(measure, 120);
    }));
    ro.observe(view);
    if (mode !== 'still') {
      const byEl = new Map(scenes.map((s) => [s.el, s]));
      const io = eng.observe(new IntersectionObserver((entries) => {
        for (const e of entries) {
          const s = byEl.get(e.target);
          if (!s) continue;
          if (e.isIntersecting) {
            live.add(s);
            s.el.classList.add('live');
          } else if (live.has(s)) {
            run(s, scrollY, true);
            live.delete(s);
            s.el.classList.remove('live');
          }
        }
        kick();
      }, { rootMargin: '50% 0px' }));
      for (const s of scenes) io.observe(s.el);
    }
    // Pointer depth: wide screens with a mouse, full motion only.
    if (mode === 'full' && pointers.length && mq('(hover: hover) and (pointer: fine)')) {
      let tx0 = 0;
      let ty0 = 0;
      let cx = 0;
      let cy = 0;
      let praf = 0;
      let lastEls = [];
      const step = () => {
        praf = 0;
        const wide = innerWidth >= 1024 && view.dataset.motion === 'full';
        const gx = wide ? tx0 : 0;
        const gy = wide ? ty0 : 0;
        cx += (gx - cx) * 0.12;
        cy += (gy - cy) * 0.12;
        const done = Math.abs(gx - cx) < 0.002 && Math.abs(gy - cy) < 0.002;
        if (done) {
          cx = gx;
          cy = gy;
        }
        const els = [];
        for (const pr of pointers) if (live.has(pr.scene)) els.push(...pr.targets());
        for (const el of lastEls) if (!els.includes(el)) write(el, '--mx', '0');
        for (const el of els) {
          el.style.setProperty('--mx', cx.toFixed(3));
          el.style.setProperty('--my', cy.toFixed(3));
        }
        lastEls = els;
        if (!done) praf = requestAnimationFrame(step);
      };
      const move = (e) => {
        tx0 = (e.clientX / innerWidth) * 2 - 1;
        ty0 = (e.clientY / innerHeight) * 2 - 1;
        if (!praf) praf = requestAnimationFrame(step);
      };
      on(window, 'pointermove', move, { passive: true });
      offs.push(() => cancelAnimationFrame(praf));
      eng.onLite.push(() => {
        window.removeEventListener('pointermove', move);
        tx0 = 0;
        ty0 = 0;
        if (!praf) praf = requestAnimationFrame(step);
      });
    }
    measure();
  };

  /** Which scene sits under the middle of the viewport, and how far through it we are. */
  eng.anchor = () => {
    const y = scrollY;
    const mid = y + innerHeight / 2;
    for (const m of marks) {
      if (mid < m.top || mid >= m.top + m.h) continue;
      const pin = m.pin;
      if (pin && y >= pin.top && y <= pin.top + pin.h - innerHeight) return { id: m.id, pin: true, p: (y - pin.top) / Math.max(1, pin.h - innerHeight) };
      return { id: m.id, p: (mid - m.top) / Math.max(1, m.h) };
    }
    return null;
  };
  eng.restore = (at) => {
    const m = marks.find((x) => x.id === at.id);
    if (!m) return;
    const y = at.pin && m.pin && m.pin.h > innerHeight ? m.pin.top + at.p * (m.pin.h - innerHeight) : m.top + at.p * m.h - innerHeight / 2;
    window.scrollTo(0, Math.max(0, Math.round(y)));
    kick();
  };
  eng.stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(rt);
    for (const id of timers) {
      clearInterval(id);
      clearTimeout(id);
    }
    timers.clear();
    for (const fn of offs) fn();
    offs.length = 0;
    for (const o of observers) o.disconnect();
    observers.length = 0;
  };
  return eng;
}

// §6 chrome: skip link, top bar, floating CTA

function chrome(c) {
  const { eng } = c;
  const runA = h('span', { class: 'on' });
  const runB = h('span');
  const run = h('div', { class: 'l-run', 'aria-hidden': 'true' }, runA, runB);
  const langBtn = () => h('button', { class: 'l-lang', type: 'button', onclick: c.toggleLang }, icon('globe'), h('span', { class: 'lbl', lang: c.rtl ? 'en' : 'ar', text: tx('lang') }));
  const bar = h(
    'header',
    { class: 'l-top', 'data-mode': 'clear' },
    h(
      'div',
      { class: 'l-top-in' },
      h('div', { class: 'l-brand' }, h('span', { class: 'app-icon studio-mark' }, icon('sparkles')), h('span', { class: 'wm', text: c.brand })),
      run,
      h('div', { class: 'l-acts' }, langBtn(), c.wa ? h('a', { class: 'l-contact', href: c.wa, target: '_blank', rel: 'noopener' }, icon('chat'), h('span', { class: 'lbl', text: tx('contact') })) : null),
    ),
    h('div', { class: 'l-prog', 'aria-hidden': 'true' }),
  );
  const prog = bar.lastChild;
  const skip = h('a', {
    class: 'l-skip',
    href: c.wa ? '#get-app' : '#finale',
    text: tx(c.wa ? 'skip' : 'skip_end'),
    onclick: (e) => {
      e.preventDefault();
      const target = c.view.querySelector('#get-app') || c.view.querySelector('#finale h2');
      target?.scrollIntoView({ block: 'center', behavior: c.mode === 'still' ? 'auto' : 'smooth' });
      target?.focus({ preventScroll: true });
    },
  });
  const fab = c.wa ? h('a', { class: 'l-fab', href: c.wa, target: '_blank', rel: 'noopener' }, icon('chat'), h('span', { text: tx('cta') })) : null;
  if (fab) fab.inert = true;

  // The floating CTA steps aside wherever another CTA (or the footer) is in view.
  let blockers = 0;
  const blocked = new Set();
  const watchBlockers = (els) => {
    if (!fab || !('IntersectionObserver' in window)) return;
    const io = eng.observe(new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) blocked.add(e.target);
        else blocked.delete(e.target);
      }
      blockers = blocked.size;
      eng.kick();
    }));
    els.filter(Boolean).forEach((el) => io.observe(el));
  };

  let mode = '';
  let head = '';
  let quiet = false;
  let fabOn = false;
  let lastProg = -1;
  const pinP = (s, y, vh) => (s ? (y - s.top) / Math.max(1, s.h - vh) : -1);
  const update = (y, vh) => {
    const marks = eng.marks;
    if (!marks.length) return;
    const pr = clamp(y / Math.max(1, eng.docH - vh));
    if (Math.abs(pr - lastProg) >= 0.001) {
      lastProg = pr;
      prog.style.setProperty('--v', pr.toFixed(3));
    }
    const cover = marks[0];
    const coverP = clamp(y / Math.max(200, cover.h - vh));
    let under = marks[0];
    let middle = marks[0];
    for (const m of marks) {
      if (m.top <= y + 32) under = m;
      if (m.top <= y + vh / 2) middle = m;
    }
    const nextMode = under === cover ? (coverP < 0.05 ? 'clear' : coverP > 0.85 && c.mode !== 'still' ? 'paper' : 'ink') : under.tone;
    if (nextMode !== mode) {
      mode = nextMode;
      bar.dataset.mode = mode;
    }
    if (middle.id !== head) {
      head = middle.id;
      const [n, name] = tx('heads')[head];
      const [shown, hidden] = runA.classList.contains('on') ? [runA, runB] : [runB, runA];
      hidden.textContent = `${n} — ${name}`;
      shown.classList.remove('on');
      hidden.classList.add('on');
    }
    const wlp = pinP(c.wlPin, y, vh);
    const q = wlp > 0 && wlp < 1;
    if (q !== quiet) {
      quiet = q;
      bar.toggleAttribute('data-quiet', q);
      if (q) {
        const [n, name] = tx('heads')['white-label'];
        const shown = runA.classList.contains('on') ? runA : runB;
        shown.textContent = `${n} — ${name}`;
      }
    }
    if (fab) {
      const pkp = pinP(c.pkPin, y, vh);
      const pinned = q || (pkp > 0 && pkp < 1);
      const show = (coverP > 0.2 || y > cover.top + cover.h) && !pinned && !blockers && innerWidth < 1024;
      if (show !== fabOn) {
        fabOn = show;
        fab.classList.toggle('on', show);
        fab.inert = !show;
      }
    }
  };
  return { bar, skip, fab, update, watchBlockers, langBtn };
}

// §7 scene builders

/** The section shell: ink or paper, its id for the running head and the contents. */
function section(c, id, tone, cls, ...children) {
  const el = h('section', { id, class: `l-sec ${tone} ${cls}` }, ...children);
  c.sections.push({ el, id, tone });
  return el;
}
const sectionHead = (id, h2, deckText, extra) => h(
  'header',
  { class: 'l-head' },
  folio(folioText(id), id === 'white-label' ? tx('wl_x') : ''),
  heading('h2', h2),
  deckText ? h('p', { class: 'l-deck', text: deckText }) : null,
  extra,
);

// ---- 5.1 COVER
function coverScene(c) {
  const { mode, eng } = c;
  const still = mode === 'still';
  const samples = [CAST.lamar, CAST.barber, CAST.rana];
  const ring = bulbRing(mode === 'lite' ? 24 : 40, c.xs);
  const glow = h('span', { class: 'cv-glow' });
  const ringEl = h('div', { class: 'cv-ring rig', 'aria-hidden': 'true' }, glow, ring.groups);
  const spot = h('div', { class: 'cv-spot rig', 'aria-hidden': 'true' }, samples.map((s, i) => h('i', { class: i ? '' : 'on', style: { '--c': s.vars['--accent-lift'] } })));
  const dust = h('div', { class: 'cv-dust rig', 'aria-hidden': 'true' });
  const bloom = h('div', { class: 'cv-bloom rig', 'aria-hidden': 'true' });
  const bone = h('div', { class: 'cv-bone rig', 'aria-hidden': 'true' });
  const scrim = h('div', { class: 'cv-scrim rig', 'aria-hidden': 'true' });
  const slots = [0, 1].map((i) => h('div', { class: `cv-slot${i ? '' : ' front'}` }, h('div', { class: 'cv-slot-in' })));
  const ph = phone(h('div', { class: 'cv-screen' }, slots), { scale: 0.9 });
  const chipVal = [h('b'), h('b')];
  const chips = [
    h('div', { class: 'cv-chip c0' }, h('span', { class: 'ic' }, icon('calendar')), h('span', null, h('span', { class: 'k', text: tx('cl')[0] }), chipVal[0])),
    h('div', { class: 'cv-chip c1' }, h('span', { class: 'ic ok' }, icon('check')), h('span', null, h('span', { class: 'k', text: tx('cl')[1] }), chipVal[1])),
  ];
  const chipLink = linkPill(samples[0].sub, c.domain, 'cv-plink');
  const phoneRig = h('div', { class: 'cv-phone rig', 'aria-hidden': 'true' }, h('div', { class: 'cv-phone-in' }, ph, chips, chipLink));
  const hold = h('div', { class: 'cv-hold' }, ringEl, phoneRig, bloom);

  const mIn = h('span', { class: 'm-in', text: tx('mast') });
  const spanM = h('span', { class: 'm rig' }, mIn);
  const spanS = h('span', { class: 's rig', text: tx('sub') });
  const deck = h('p', { class: 'cv-deck rig', text: tx('deck') });
  const howBtn = h('button', { class: 'l-textlink', type: 'button', onclick: () => c.go('how') }, h('span', { text: tx('how_btn') }), icon('down'));
  const actions = h('div', { class: 'cv-actions rig' }, c.wa ? c.cta('cv-cta') : h('p', { class: 'l-soon', text: tx('soon') }), howBtn);
  const eyebrow = h('p', { class: 'cv-eyebrow rig' }, h('i', { class: 'l-bulb' }), h('span', { text: tx('eyebrow') }));
  const copy = h('div', { class: 'cv-copy' }, eyebrow, h('h1', { class: 'cv-h1' }, spanM, ' ', spanS), deck, actions);

  const DX = [[-80, -40], [60, 30], [-50, 60], [90, -20]];
  const vals = [h('b'), h('b'), h('b', { class: 'ltrv' }), h('b', { text: tx('cl_wl') })];
  const lines = tx('cl').map((k, i) => h('li', { class: 'cl rig', style: { '--dx': `${DX[i][0]}px`, '--dy': `${DX[i][1]}px`, '--i': String(i) } }, h('span', { class: 'k', text: k }), vals[i]));
  const lineList = h('ul', { class: 'cv-lines rig' }, lines);
  const cue = h('div', { class: 'cv-cue rig', 'aria-hidden': 'true' }, h('span', { class: 'ln' }, h('i')), h('span', { text: tx('scroll') }));
  const stage = h('div', { class: 'l-stage cv-stage' }, spot, dust, scrim, copy, hold, lineList, cue, bone);
  const el = section(c, 'cover', 'ink', 'l-cover l-pin', stage);
  if (!still) el.classList.add('pin');

  const fill = (slot, s) => {
    paintSalon(slot, s);
    clear(slot.firstChild, salonApp(s));
  };
  const values = (s, animate) => {
    const v = [`${pick(s.services[0], 'name')} · ${fmtTime(s.at)}`, `${tx('cliq')} · ${fmtPrice(s.deposit, 'JOD')}`, ltr(`${s.sub}.${c.domain}`)];
    v.forEach((text, i) => {
      vals[i].textContent = text;
      if (i < 2) chipVal[i].textContent = text;
    });
    chipLink.sub.textContent = s.sub;
    if (animate) {
      // Only the set on screen: the coverlines are hidden on phones and the chips on wide screens, and an
      // animation on a hidden element ticks on the main thread for nothing.
      (innerWidth >= 1024 ? vals.slice(0, 3) : [...chipVal, chipLink]).forEach((x, i) => x.animate?.([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: i * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    }
  };
  fill(slots[0], samples[0]);
  values(samples[0], false);

  let cur = 0;
  let front = 0;
  const scene = eng.add({
    el,
    kind: 'pin',
    rigs: still ? [] : [
      { el: spanM, v: (p) => smooth(seg(p, 0, 0.32)) },
      { el: [eyebrow, spanS, deck, actions, scrim], v: (p) => seg(p, 0, 0.22) },
      ...lines.map((li) => ({ el: li, v: (p) => seg(p, 0, 0.25) })),
      { el: ringEl, v: (p) => seg(p, 0, 0.6), w: (p) => seg(p, 0.35, 0.6) },
      { el: phoneRig, v: (p) => smooth(seg(p, 0, 0.5)), w: (p) => seg(p, 0.38, 0.58) },
      { el: bloom, v: (p) => seg(p, 0.25, 0.85), w: (p) => seg(p, 0.25, 0.5) },
      { el: bone, v: (p) => seg(p, 0.72, 0.96) },
      { el: [dust, spot], v: (p) => p },
      { el: cue, v: (p) => seg(p, 0, 0.08) },
    ],
    measure(vw, vh) {
      const wide = vw >= 1024;
      let sc = 0.64;
      let top;
      if (wide) {
        const fs = spanM.offsetHeight / 1.29;
        const mastTop = offIn(spanM, stage).y + fs * 0.12;
        sc = clamp((vh - 0.6 * fs * 1.05 - 140) / 630, 0.62, 0.9);
        top = mastTop + 0.6 * fs * 1.05;
        stage.style.setProperty('--col-top', `${offIn(spanS, stage).y}px`);
      } else {
        top = offIn(actions, stage).y + actions.offsetHeight + (still ? 64 : 44);
      }
      ph.style.setProperty('--scale', sc.toFixed(3));
      stage.style.setProperty('--ph-top', `${Math.round(top)}px`);
      stage.style.setProperty('--ph-w', `${(300 * sc).toFixed(1)}px`);
      stage.style.setProperty('--ph-h', `${(630 * sc).toFixed(1)}px`);
      phoneRig.style.setProperty('--to-centre', `${Math.round(vh / 2 - (top + (630 * sc) / 2))}px`);
      if (still && !wide) stage.style.setProperty('--still-h', `${Math.round(top + 630 * sc + 120)}px`);
    },
  });
  c.coverScene = scene;
  if (!still) eng.pointer(scene, () => [phoneRig, ringEl, spanM, lineList]);

  // A focused button is never left invisible in the faded copy.
  copy.addEventListener('focusin', () => {
    if (scene.p > 0.05) window.scrollTo(0, scene.top);
  });

  if (mode === 'full') {
    eng.every(4800, () => {
      if (!el.classList.contains('live') || document.hidden || c.view.dataset.motion !== 'full' || scene.p > 0.02) return;
      cur = (cur + 1) % samples.length;
      const s = samples[cur];
      const inc = slots[front ^ 1];
      const out = slots[front];
      front ^= 1;
      fill(inc, s);
      inc.classList.remove('go', 'front');
      inc.classList.add('next');
      out.classList.remove('front');
      inc.style.zIndex = '2';
      out.style.zIndex = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        inc.classList.add('go', 'front');
        inc.classList.remove('next');
      }));
      [...spot.children].forEach((x, i) => x.classList.toggle('on', i === cur));
      glow.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' });
      values(s, true);
    });
  }
  if (!still) c.ready.then(() => el.classList.add('go'));
  return el;
}

// ---- 5.2 LETTER
function letterScene(c) {
  const { mode, eng } = c;
  const words = [];
  const split = (text) => text.split(' ').flatMap((w, i) => {
    const sp = h('span', { class: 'lw', text: w });
    words.push(sp);
    return i ? [' ', sp] : [sp];
  });
  const para = h('p', { class: 'lt-p' }, split(tx('letter')), ' ', h('b', null, split(tx('letter_b'))));
  const quote = h('div', { class: 'lt-q rig', 'aria-hidden': 'true', text: tx('quote') });
  const sign = h('p', { class: 'lt-sign' }, tx('sign'), ' ', lockup(c.brand), tx('sign_after') ? ` ${tx('sign_after')}` : '');
  const pun = c.tenant.name_ar === 'صالونك' ? h('p', { class: 'lt-pun', text: tx('pun', { brand: c.brand }) }) : null;
  const ids = ['white-label', 'collection', 'pocket', 'booking', 'backstage', 'how', 'finale'];
  const toc = h(
    'nav',
    { class: 'lt-toc', 'aria-labelledby': 'toc-h' },
    h('h3', { id: 'toc-h', text: tx('toc') }),
    h('ol', null, ids.map((id) => {
      const [n, name] = tx('heads')[id];
      return h('li', null, h('button', { type: 'button', onclick: () => c.go(id) }, h('span', { class: 'n', text: n }), h('span', { class: 'nm', text: name })));
    })),
  );
  const paper = h('div', { class: 'lt-in rig' }, h('div', { class: 'lt-side' }, h('h2', { class: 'l-folio lt-folio', text: folioText('letter') }), quote), h('div', { class: 'lt-main' }, para, sign, pun), toc);
  const el = section(c, 'letter', 'paper', 'l-letter', paper);
  let inked = 0;
  const ink = (n) => {
    if (n === inked) return;
    for (let i = Math.min(n, inked); i < Math.max(n, inked); i++) words[i].classList.toggle('on', n > inked);
    inked = n;
  };
  if (mode === 'still') ink(words.length);
  eng.add({
    el,
    kind: 'view',
    rigs: mode === 'still' ? [] : [{ el: paper, v: (p) => seg(p, 0, 0.25) }, { el: quote, v: (p) => p }],
    onP: mode === 'still' ? null : (p) => ink(Math.min(words.length, Math.ceil(seg(p, 0.15, 0.45) * words.length - 1e-6))),
  });
  eng.once(toc, () => toc.classList.add('in'), 0.25);
  return el;
}

// ---- 5.3 WHITE LABEL
const CHAPTERS = [[0, 0.38], [0.3, 0.7], [0.62, 1]];
const CH_START = [0, 0.38, 0.7];
// A link-preview card's text (the white-label satellite and the chat in the pocket scene).
const ogBody = (c, s) => h('div', { class: 'og-b' }, h('b', { text: pick(s, 'name') }), h('p', { text: pick(s, 'about') }), h('span', { dir: 'ltr', text: `${s.sub}.${c.domain}` }));

function plate(c, s, i) {
  const data = salonData(s);
  const mini = salonApp(s);
  mini.append(h('div', { class: 'wl-fine' }, powered(c.brand)));
  const ph = phone(mini, { scale: 0.9 });
  const sat = (n, ...kids) => h('div', { class: 'sat', 'data-n': String(n) }, h('span', { class: 'badge', text: pad(n) }), ...kids);
  const v = s.vars;
  const sw = (hex, label) => h('span', { class: 'sw' }, h('i', { style: { background: hex } }), h('span', null, h('small', { text: label }), h('b', { text: hex.toUpperCase() })));
  const colours = h('div', { class: 'wl-colours' }, sw(s.primary, tx('sw')[0]), sw(s.accent, tx('sw')[1]));
  const splash = phone(splashScreen({ salon: data }), { scale: 0.36 });
  const preview = h(
    'div',
    { class: 'wl-og' },
    h('img', { src: coverSvg(s), alt: '' }),
    ogBody(c, s),
  );
  const dash = h(
    'div',
    { class: 'wl-dash', 'data-theme': 'studio', 'data-studio': 'brand' },
    h('div', { class: 'dh' }, salonIcon(data), h('div', null, h('span', { text: t('home.morning') }), h('b', { text: pick(s, 'name') }))),
    h('div', { class: 'dt' }, h('span', { text: tx('today_n') }), h('i'), h('i'), h('i')),
    h('div', { class: 'db', text: tx('nav')[1] }),
  );
  const link = linkPill(s.sub, c.domain, 'wl-plink');
  const phoneRig = h(
    'div',
    { class: 'wl-phone rig' },
    ph,
    h('span', { class: 'wl-mk mk1' }, h('span', { class: 'badge', text: '01' })),
    h('span', { class: 'wl-mk mk3' }, h('span', { class: 'badge', text: '03' }), h('span', { class: 'tag', text: tx(s.look) })),
  );
  const far = h('div', { class: 'wl-far rig' }, sat(4, h('div', { class: 'wl-icon' }, salonIcon(data))), sat(5, h('div', { class: 'wl-splash' }, splash)), sat(7, preview));
  const near = h('div', { class: 'wl-near rig' }, sat(2, colours), sat(8, dash), sat(6, link));
  const glowEl = h('div', { class: 'wl-glow rig' });
  const nameEl = h('div', { class: 'wl-name rig' }, h('span', { text: pick(s, 'name') }));
  const inner = h('div', { class: `wl-pi ${s.look}` }, glowEl, nameEl, h('div', { class: 'wl-box' }, far, phoneRig, near));
  paintSalon(inner, s);
  inner.style.setProperty('--hex-a', v['--accent-lift']);
  const bar = i ? h('div', { class: 'wl-bar rig' }, Array.from({ length: 9 }, () => h('i'))) : null;
  const el = h('div', { class: 'wl-plate', 'data-i': String(i) }, inner, bar);
  return { el, inner, bar, ph, splash, link, phoneRig, far, near, glowEl, nameEl };
}

function whiteLabelScene(c) {
  const { mode, eng } = c;
  const chapters = [CAST.lamar, CAST.barber, CAST.joud];
  const head = sectionHead('white-label', tx('wl_h2'), tx('wl_deck'), h('p', { class: 'l-note', text: tx('examples') }));
  const labelLine = (line) => line.replace('{domain}', ltr(`.${c.domain}`));
  const labelItems = () => tx('wl_labels').map(([title, line], i) => h(
    'li',
    { class: 'wl-li', 'data-n': String(i + 1) },
    h('span', { class: 'n', text: pad(i + 1) }),
    h('div', { class: 'tx' }, h('span', { class: 'cnt', 'aria-hidden': 'true', text: ltr(`${pad(i + 1)} / 08`) }), h('h3', { text: title }), h('p', { text: labelLine(line) })),
  ));
  const lens = () => {
    const r = bulbRing(16, c.xs, 'lens-b');
    return h('div', { class: 'wl-lens', 'aria-hidden': 'true' }, r.groups, h('div', { class: 'glass' }, powered(c.brand)));
  };

  if (mode === 'still') {
    const cards = chapters.map((s) => {
      const data = salonData(s);
      const card = h(
        'figure',
        { class: 'wls-card' },
        h('div', { class: 'wls-art', 'aria-hidden': 'true' }, h('div', { class: 'wl-glow' }), phone(salonApp(s), { scale: 0.62 }), h('div', { class: 'wls-icon' }, salonIcon(data))),
        h('figcaption', null, h('b', { text: pick(s, 'name') }), h('span', { text: tx(s.look) }), linkPill(s.sub, c.domain)),
      );
      return paintSalon(card, s);
    });
    const el = section(c, 'white-label', 'ink', 'l-wl still', head, h('div', { class: 'wls-strip' }, cards), h('ol', { class: 'wls-labels' }, labelItems()),
      h('div', { class: 'wls-mag' }, lens(), h('p', { text: tx('mag') })));
    eng.add({ el, kind: 'view' });
    return el;
  }

  const lite = mode === 'lite';
  const plates = chapters.map((s, i) => plate(c, s, i));
  const items = labelItems();
  const ol = h('ol', { class: 'wl-labels' }, items);
  const ticks = h('div', { class: 'wl-ticks', 'aria-hidden': 'true' }, Array.from({ length: 8 }, () => h('i')));
  const capMag = h('p', { class: 'wl-capmag', text: tx('mag') });
  const cap = h('div', { class: 'wl-cap' }, h('div', { class: 'wl-stack' }, ol, capMag), ticks);
  const unders = [];
  const chBtns = chapters.map((s, i) => {
    const u = h('i', { class: 'u rig' });
    unders.push(u);
    return h('button', { class: 'wl-ch', type: 'button', 'aria-label': tx('wl_go', { name: pick(s, 'name') }), onclick: () => goChapter(i) }, h('span', null, pick(s, 'name'), h('span', { class: 'lk', text: ` · ${tx(s.look)}` })), u);
  });
  const chRow = h('div', { class: 'wl-chs' }, chBtns);
  const mag = h('div', { class: 'wl-mag' }, h('div', { class: 'wl-box' }, h('div', { class: 'wl-magpos' }, lens(), h('span', { class: 'arrow', 'aria-hidden': 'true' }), h('p', { class: 'ann', text: tx('mag') }))));
  const stage = h('div', { class: 'l-stage wl-stage', 'data-l': '0' }, h('div', { class: 'wl-plates', 'aria-hidden': 'true' }, plates.map((p) => p.el)), cap, chRow, mag);
  const pin = h('div', { class: 'l-pin wl-pin pin' }, stage);
  const el = section(c, 'white-label', 'ink', 'l-wl', head, pin);

  const rigs = [];
  plates.forEach((pl, i) => {
    const [a, b] = CHAPTERS[i];
    const local = (p) => seg(p, a, b);
    if (i && !lite) {
      const w = i === 1 ? (p) => smooth(seg(p, 0.3, 0.38)) : (p) => smooth(seg(p, 0.62, 0.7));
      rigs.push({ el: [pl.el, pl.inner, pl.bar], v: w });
    }
    rigs.push({ el: pl.glowEl, v: local }, { el: pl.far, v: local }, { el: pl.near, v: local });
    if (!lite) rigs.push({ el: pl.phoneRig, v: local }, { el: pl.nameEl, v: local });
  });
  unders.forEach((u, i) => rigs.push({ el: u, v: (p) => seg(p, CH_START[i], i < 2 ? CH_START[i + 1] : 1) }));

  let li = -1;
  let ch = -1;
  let magOn = false;
  let vis = '';
  let typer = 0;
  const retype = (k) => {
    eng.clear(typer);
    const target = plates[k].link.sub;
    const word = chapters[k].sub;
    if (mode !== 'full') {
      target.textContent = word;
      return;
    }
    let n = target.textContent.length;
    let phase = n ? -1 : 1;
    typer = eng.every(40, () => {
      if (!pin.classList.contains('live') || document.hidden) return;
      n += phase;
      if (n <= 0) {
        n = 0;
        phase = 1;
      }
      target.textContent = word.slice(0, n);
      if (phase > 0 && n >= word.length) eng.clear(typer);
    });
  };
  const scene = eng.add({
    el: pin,
    kind: 'pin',
    rigs,
    onP(p) {
      const i = Math.min(7, Math.floor(p / 0.1075));
      if (i !== li) {
        if (li >= 0) items[li].classList.remove('on');
        items[i].classList.add('on');
        stage.dataset.l = String(i);
        li = i;
      }
      const m = p >= 0.86;
      if (m !== magOn) {
        magOn = m;
        stage.classList.toggle('mag', m);
      }
      const k = p < 0.34 ? 0 : p < 0.66 ? 1 : 2;
      if (k !== ch) {
        const first = ch < 0;
        ch = k;
        stage.style.setProperty('--wl-acc', chapters[k].vars['--accent-lift']);
        chBtns.forEach((b, j) => (j === k ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
        // Always kept: the frame guard can switch the page to lite mid-pin, and lite shows only .cur.
        plates.forEach((pl, j) => pl.el.classList.toggle('cur', j === k));
        if (!first) retype(k);
      }
      if (!lite) {
        const v = `${p < 0.38 ? 1 : 0}${p > 0.3 && p < 0.7 ? 1 : 0}${p > 0.62 ? 1 : 0}`;
        if (v !== vis) {
          vis = v;
          plates.forEach((pl, j) => pl.el.classList.toggle('off', v[j] === '0'));
        }
      }
    },
    measure(vw, vh) {
      const wide = vw >= 1024;
      const capH = wide ? 0 : cap.offsetHeight;
      // Compact: room for the bar, the chapter row, the caption card and the link pill (34px + 12px) under the phone.
      const sc = wide ? Math.min(0.9, (vh - 64 - 190) / 630) : clamp((vh - 56 - 44 - capH - 48 - 24 - 46) / 630, 0.42, 0.62);
      for (const pl of plates) pl.ph.style.setProperty('--scale', sc.toFixed(3));
      stage.style.setProperty('--ph-w', `${(300 * sc).toFixed(1)}px`);
      stage.style.setProperty('--ph-h', `${(630 * sc).toFixed(1)}px`);
      stage.style.setProperty('--sat', Math.min(clamp((vw - 900) / 280, 0.8, 1), clamp((vh - 460) / 340, 0.72, 1)).toFixed(3));
      stage.style.setProperty('--cap-h', `${capH}px`);
    },
  });
  c.wlPin = scene;
  eng.pointer(scene, () => {
    const pl = plates[Math.max(0, ch)];
    return [pl.phoneRig, pl.far, pl.near];
  });
  const goChapter = (i) => window.scrollTo({ top: scene.top + CH_START[i] * (scene.h - innerHeight) + (i ? 4 : 2), behavior: 'smooth' });
  return el;
}

// ---- 5.4 COLLECTION
function collectionScene(c) {
  const { mode, eng } = c;
  const still = mode === 'still';
  const list = [CAST.lamar, CAST.barber, CAST.rana, CAST.joud];
  const spreads = list.map((s, i) => {
    const data = salonData(s);
    const arc = Array.from({ length: 12 }, (_, k) => h('i', { style: { '--k': String(k), '--a': `${n1(-55 + (110 * k) / 11)}deg` } }));
    const glow = h('div', { class: 'co-glow rig' });
    const name = h('div', { class: 'co-name rig', text: pick(s, 'name') });
    const ph = h('div', { class: 'co-ph rig' }, phone(salonApp(s, {}, false), { scale: 0.62 }));
    const ic = h('div', { class: 'co-icon rig' }, salonIcon(data));
    const fig = h(
      'figure',
      { class: `co-sp ${s.look}`, 'data-i': String(i) },
      glow,
      h('div', { class: 'co-arc', 'aria-hidden': 'true' }, arc),
      h('div', { class: 'co-meta' }, h('span', { class: 'idx', text: ltr(`${pad(i + 1)} / 04`) }), h('span', { class: 'tag', text: `${tx('types')[s.type]} · ${tx(s.look)}` })),
      h('figcaption', null, name),
      h('div', { class: 'co-art', 'aria-hidden': 'true' }, ph, ic),
      h('div', { class: 'co-foot' }, linkPill(s.sub, c.domain), h('div', { class: 'co-fabric' }, [s.primary, s.accent].map((hex, k) => h('span', null, h('i', { style: { background: hex } }), h('small', { text: tx('sw')[k] }), h('b', { text: hex.toUpperCase() }))))),
    );
    paintSalon(fig, s);
    return { fig, glow, name, ph, ic };
  });
  const track = h('div', { class: 'co-track rig' }, spreads.map((x) => x.fig));
  const stage = h('div', { class: 'l-stage co-stage' }, track);
  const pin = h('div', { class: `co-pin${still ? '' : ' pin'}` }, stage);
  const counter = h('span', { class: 'co-count', 'aria-hidden': 'true', text: ltr('1 / 4') });
  const dots = h('span', { class: 'co-dots', 'aria-hidden': 'true' }, list.map((_, i) => h('i', { class: i ? '' : 'on' })));
  const step = (dir) => {
    const w = spreads[0].fig.offsetWidth + 12;
    track.scrollBy({ left: dir * w * (c.rtl ? -1 : 1), behavior: still ? 'auto' : 'smooth' });
  };
  const ui = h(
    'div',
    { class: 'co-ui' },
    h('button', { class: 'co-nav', type: 'button', 'aria-label': tx('prev'), onclick: () => step(-1) }, icon('chevron', 'flip-rtl')),
    counter,
    dots,
    h('span', { class: 'co-hint', 'aria-hidden': 'true' }, tx('swipe')),
    h('button', { class: 'co-nav', type: 'button', 'aria-label': tx('next'), onclick: () => step(1) }, icon('chevron', 'flip-ltr')),
  );
  const el = section(c, 'collection', 'ink', 'l-co', sectionHead('collection', tx('co_h2'), tx('co_deck')), pin, ui);

  let wide = false;
  let lit = 0;
  const rel = (p, i) => clamp(seg(p, 0, 0.86) * 3 - i, -1.5, 1.5);
  const rigs = [{ el: track, v: (p) => (wide ? seg(p, 0, 0.86) : 0) }];
  if (mode === 'full') {
    spreads.forEach((x, i) => {
      rigs.push(
        { el: x.ph, v: (p) => (wide ? rel(p, i) : 0) },
        { el: x.ic, v: (p) => (wide ? rel(p, i) : 0) },
        { el: x.name, v: (p) => (wide ? rel(p, i) : 0) },
        { el: x.glow, v: (p) => (wide ? 1.15 - Math.abs(rel(p, i)) * 0.15 : 1) },
      );
    });
  }
  eng.add({
    el: pin,
    kind: 'pin',
    rigs: still ? [] : rigs,
    onP: mode === 'full' ? (p) => {
      if (!wide) return;
      spreads.forEach((x, i) => {
        if (!(lit & (1 << i)) && Math.abs(rel(p, i)) < 0.5) {
          lit |= 1 << i;
          x.fig.classList.add('lit');
        }
      });
    } : null,
    measure(vw) {
      wide = vw >= 1024 && !still;
      pin.classList.toggle('pin', wide);
      if (wide) {
        const ov = Math.max(0, Math.ceil(track.offsetWidth - stage.clientWidth));
        track.style.setProperty('--ov', String(ov));
        pin.style.height = `calc(100${SVH} + ${ov}px + 30${SVH})`;
      } else {
        pin.style.height = '';
      }
    },
  });
  if (mode !== 'full') spreads.forEach((x) => x.fig.classList.add('lit'));
  // The centred card on the native strip (compact, and every width when still). Rooted on the strip, so it
  // starts only once the strip is on screen and the first card lights up where it can be seen.
  const observeStrip = () => {
    if (!('IntersectionObserver' in window)) return;
    const seen = new Set();
    const io = eng.observe(new IntersectionObserver((es) => {
      for (const e of es) {
        const i = Number(e.target.dataset.i);
        e.target.classList.toggle('on', e.isIntersecting);
        if (e.isIntersecting) seen.add(i);
        else seen.delete(i);
      }
      // The first card in full view (a wide still strip shows two or three at once).
      if (!seen.size) return;
      const i = Math.min(...seen);
      counter.textContent = ltr(`${i + 1} / 4`);
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    }, { root: track, threshold: 0.6 }));
    spreads.forEach((x) => io.observe(x.fig));
  };
  if (still) observeStrip();
  else eng.once(track, observeStrip, innerWidth >= 1024 ? 0.1 : 0.4);
  if (!still) {
    eng.once(track, () => {
      if (innerWidth >= 1024) return;
      eng.after(500, () => spreads[0].fig.animate?.([{ translate: '0 0' }, { translate: `${-16 * c.xs}px 0` }, { translate: '0 0' }], { duration: 900, easing: 'ease-in-out' }));
    }, 0.6);
  }
  return el;
}

// ---- 5.5 TRY IT ON YOUR SALON
function tryScene(c) {
  const { mode, eng } = c;
  const st = { pal: 'gold', look: 'night', name: '' };
  const palette = (id) => PALETTES.find((p) => p[0] === id);
  const trySalon = () => ({
    name_ar: st.name || tx('try_name'), name_en: st.name || tx('try_name'), about_ar: tx('try_about'), about_en: tx('try_about'),
    logo_url: null, cover_url: null, icon_url: null, icon_bg: 'auto', page_theme: st.look, currency: 'JOD', timezone: 'Asia/Amman',
  });
  const screen = h('div', { class: 'try-screen' });
  const ph = phone(screen, { scale: 0.9 });
  const iconBox = h('div', { class: 'try-ic' });
  const iconName = h('span', { class: 'nm' });
  const link = linkPill('your-salon', c.domain, 'try-link');
  const caption = h('p', { class: 'try-cap', 'aria-live': 'polite' });
  const input = h('input', { id: 'try-name', class: 'try-in', type: 'text', dir: 'auto', maxlength: '24', autocomplete: 'off', spellcheck: 'false', placeholder: tx('try_ph') });
  const swatches = TRY_PALETTES.map((id) => {
    const [, p, a] = palette(id);
    return h('button', { class: 'try-sw', type: 'button', 'data-id': id, 'aria-pressed': String(id === st.pal), 'aria-label': t(`pal.${id}`), onclick: () => setPal(id) }, h('i', { style: { '--p': p, '--a': a } }));
  });
  const looks = ['night', 'day'].map((k) => h('button', { type: 'button', 'aria-pressed': String(k === st.look), onclick: () => setLook(k) }, h('span', { text: tx(k) })));
  const stageArt = h(
    'div',
    { class: 'try-art', 'aria-hidden': 'true' },
    h('div', { class: 'try-glow' }),
    h('div', { class: 'try-ph' }, ph),
    h('div', { class: 'try-tile' }, iconBox, iconName),
    link,
  );
  const sec = h(
    'section',
    { id: 'try', class: 'l-sec ink l-try', 'aria-labelledby': 'try-h' },
    h(
      'div',
      { class: 'try-grid' },
      h(
        'div',
        { class: 'try-copy' },
        h('p', { class: 'l-kicker' }, h('i', { class: 'l-bulb' }), tx('try_kicker')),
        h('h3', { id: 'try-h', class: 'try-h', text: tx('try_h3') }),
        h('p', { class: 'l-deck', text: tx('try_sub') }),
        h('div', { class: 'try-art-slot' }),
        h('label', { class: 'try-f', for: 'try-name' }, h('span', { text: tx('try_name') }), input),
        h('fieldset', { class: 'try-pal' }, h('legend', { text: tx('try_colours') }), h('div', { class: 'sws' }, swatches)),
        h('div', { class: 'try-look' }, h('span', { class: 'lab', id: 'try-look', text: tx('try_look') }), h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'try-look' }, looks)),
        caption,
        h('p', { class: 'l-note', text: tx('try_foot') }),
        c.wa ? c.cta('try-cta') : null,
      ),
      stageArt,
    ),
  );
  c.sections.push({ el: sec, id: 'try', tone: 'ink' });
  c.trySec = sec;

  const render = () => {
    const data = trySalon();
    clear(screen, miniApp({ salon: data, services: TRY_SERVICES, staff: [], hours: ALWAYS_OPEN }));
    clear(iconBox, salonIcon(data));
    iconName.textContent = data.name_ar;
    caption.textContent = tx('try_cap', { palette: t(`pal.${st.pal}`), look: tx(st.look) });
  };
  const setPal = (id) => {
    st.pal = id;
    const [, p, a] = palette(id);
    paint(sec, p, a, 'var(--primary)');
    swatches.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    render();
  };
  const setLook = (k) => {
    st.look = k;
    looks.forEach((b, i) => b.setAttribute('aria-pressed', String(['night', 'day'][i] === k)));
    render();
  };
  let deb = 0;
  input.addEventListener('input', () => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      st.name = input.value.trim();
      const name = st.name || tx('try_name');
      screen.querySelector('.mini-hero .t')?.replaceChildren(name);
      iconName.textContent = name;
      const latin = /[a-z]/i.test(st.name);
      link.sub.textContent = latin ? st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '') || 'your-salon' : 'your-salon';
    }, 120);
  });
  setPal(st.pal);
  // The phone sits beside the controls on wide screens, between the words and the controls on phones.
  const slot = sec.querySelector('.try-art-slot');
  const place = () => {
    const wide = innerWidth >= 1024;
    ph.style.setProperty('--scale', wide ? '0.9' : '0.56');
    if (wide && stageArt.parentElement !== sec.firstChild) sec.firstChild.append(stageArt);
    else if (!wide && stageArt.parentElement !== slot) slot.append(stageArt);
  };
  place();
  eng.add({ el: sec, kind: 'view', measure: place });
  eng.once(stageArt, () => sec.classList.add('in'), 0.25);
  if (mode === 'still') sec.classList.add('in');
  return sec;
}

// ---- 5.6 POCKET
function chatLayer(c, s, typed) {
  const data = salonData(s);
  const card = h(
    'div',
    { class: 'pk-card' },
    h('img', { src: coverSvg(s), alt: '' }),
    ogBody(c, s),
  );
  const layer = h(
    'div',
    { class: 'pk-l pk-chat' },
    h('div', { class: 'pk-chead' }, salonIcon(data), h('b', { text: pick(s, 'name') })),
    h('div', { class: 'pk-msgs' }, h('div', { class: 'bub out', text: tx('chat_c') }), h('div', { class: 'bub in', text: tx('chat_s') }), h('div', { class: 'bub in url', dir: 'ltr' }, typed, h('i', { class: 'caret' })), card),
  );
  return { layer, card };
}

function pocketScene(c) {
  const { mode, eng } = c;
  const s = CAST.corner;
  const data = salonData(s, { page_theme: 'day' });
  const steps = tx('pk_steps');
  const subs = ['lamar', 'barber-house', 'rana-nails', 'joud-studio', 'corner-barber', 'your-salon'];
  const row = (order) => h('div', { class: 'pk-row rig', dir: 'ltr' }, order.map((x) => h('span', { class: x === 'corner-barber' ? 'me' : '' }, h('b', { text: x }), `.${c.domain}`)));
  const rowsA = row(subs);
  const rowsB = row([...subs.slice(3), ...subs.slice(0, 3)]);
  const rows = h('div', { class: 'pk-rows', 'aria-hidden': 'true' }, rowsA, rowsB);
  const head = sectionHead('pocket', tx('pk_h2'), tx('pk_deck'));
  const stepItems = steps.map(([title, line], i) => h('li', { class: 'pk-st', 'data-n': String(i + 1) }, h('span', { class: 'n', 'aria-hidden': 'true', text: String(i + 1) }), h('div', { class: 'tx' }, h('span', { class: 'cnt', 'aria-hidden': 'true', text: ltr(`${i + 1} / 4`) }), h('h3', { text: title }), h('p', { text: line }))));

  if (mode === 'still') {
    const shots = [
      (() => {
        const t0 = h('span', { text: `${s.sub}.${c.domain}` });
        const ch = chatLayer(c, s, t0);
        return h('div', { class: 'pk-screen pks', 'data-s': '1' }, ch.layer);
      })(),
      h('div', { class: 'pk-screen pks' }, h('div', { class: 'pk-l' }, salonApp(s, { page_theme: 'day' }))),
      h('div', { class: 'pk-screen pks' }, h('div', { class: 'pk-l' }, homeScreen({ salon: data }))),
      h('div', { class: 'pk-screen pks' }, h('div', { class: 'pk-l' }, splashScreen({ salon: data }))),
    ];
    const cards = shots.map((scr, i) => h('li', { class: 'pks-card' }, h('div', { class: 'pks-ph', 'aria-hidden': 'true' }, phone(scr, { scale: 0.6 })), h('span', { class: 'n', 'aria-hidden': 'true', text: String(i + 1) }), h('h3', { text: steps[i][0] }), h('p', { text: steps[i][1] })));
    const strip = h('ol', { class: 'pks-strip' }, cards);
    paintSalon(strip, s);
    const el = section(c, 'pocket', 'paper', 'l-pk still', head, rows, strip);
    eng.add({ el, kind: 'view' });
    return el;
  }

  const lite = mode === 'lite';
  const typed = h('span', { class: 'pk-typed' });
  const word = `${s.sub}.${c.domain}`;
  const chat = chatLayer(c, s, typed);
  const page = h('div', { class: 'pk-l pk-page' }, salonApp(s, { page_theme: 'day' }));
  const sheetIcon = salonIcon(data);
  const sheet = h(
    'div',
    { class: 'pk-l pk-sheet' },
    h('div', { class: 'pk-sh' }, h('i', { class: 'grab' }), h('div', { class: 'pk-si' }, sheetIcon), h('b', { text: pick(s, 'name') }), h('span', { dir: 'ltr', text: `${s.sub}.${c.domain}` }), h('div', { class: 'pk-install' }, icon('plus'), h('span', { text: t('install.app') }))),
  );
  const home = h('div', { class: 'pk-l pk-home' }, homeScreen({ salon: data }));
  const splash = h('div', { class: 'pk-l pk-splash' }, splashScreen({ salon: data }));
  const fly = h('div', { class: 'pk-fly' }, h('div', { class: 'pk-fly-y' }, salonIcon(data)));
  const screen = h('div', { class: 'pk-screen' }, chat.layer, page, sheet, home, splash, fly);
  const ph = phone(screen, { scale: 1 });
  const phoneRig = h('div', { class: 'pk-phone rig', 'aria-hidden': 'true' }, ph);
  const numeral = h('div', { class: 'pk-num rig', 'aria-hidden': 'true' }, h('span', { text: '1' }));
  const ticks = h('div', { class: 'pk-ticks', 'aria-hidden': 'true' }, steps.map(() => h('i')));
  const cap = h('div', { class: 'pk-cap' }, h('ol', { class: 'pk-steps' }, stepItems), ticks);
  const stage = h('div', { class: 'l-stage pk-stage', 'data-s': '0', 'data-step': '1' }, cap, h('div', { class: 'pk-side' }, numeral, phoneRig));
  paintSalon(stage, s);
  const pin = h('div', { class: 'l-pin pk-pin pin' }, stage);
  const el = section(c, 'pocket', 'paper', 'l-pk', head, rows, pin);
  eng.add({ el: rows, kind: 'view', rigs: [{ el: rowsA, v: (p) => p - 0.5 }, { el: rowsB, v: (p) => 0.5 - p }] });

  let typedN = -1;
  const STEP = [1, 1, 2, 3, 3, 4, 4];
  const scene = eng.add({
    el: pin,
    kind: 'pin',
    beats: [0.16, 0.3, 0.44, 0.58, 0.76, 0.9],
    beat: 0,
    onBeat(i) {
      stage.dataset.s = String(i);
      const n = String(STEP[i]);
      if (stage.dataset.step !== n) {
        stage.dataset.step = n;
        numeral.firstChild.textContent = n;
        stepItems.forEach((li, k) => li.classList.toggle('on', k + 1 === STEP[i]));
      }
    },
    onP(p) {
      const n = Math.round(seg(p, 0.02, 0.14) * word.length);
      if (n !== typedN) {
        typedN = n;
        typed.textContent = word.slice(0, n);
      }
    },
    rigs: [{ el: numeral, v: (p) => p }, { el: phoneRig, v: (p) => p - 0.5 }],
    measure(vw, vh) {
      const wide = vw >= 1024;
      const capH = wide ? 0 : cap.offsetHeight;
      const sc = wide ? clamp((vh - 64 - 96) / 630, 0.6, 1) : clamp((vh - 56 - capH - 32 - 24) / 630, 0.4, 0.64);
      ph.style.setProperty('--scale', sc.toFixed(3));
      stage.style.setProperty('--ph-w', `${(300 * sc).toFixed(1)}px`);
      stage.style.setProperty('--ph-h', `${(630 * sc).toFixed(1)}px`);
      stage.style.setProperty('--cap-h', `${capH}px`);
      // Phone-screen geometry (278x608, unscaled), from layout offsets.
      const set = (k, v) => screen.style.setProperty(k, `${n1(v)}px`);
      const card = offIn(chat.card, screen);
      set('--c-x', card.x);
      set('--c-y', card.y);
      screen.style.setProperty('--c-sx', (chat.card.offsetWidth / 278).toFixed(4));
      screen.style.setProperty('--c-sy', (chat.card.offsetHeight / 608).toFixed(4));
      const si = offIn(sheetIcon, screen);
      const ix = si.x + sheetIcon.offsetWidth / 2;
      const iy = si.y + sheetIcon.offsetHeight / 2;
      const mineIcon = home.querySelector('.mine .app-icon');
      const mi = offIn(mineIcon, screen);
      const mx = mi.x + mineIcon.offsetWidth / 2;
      const my = mi.y + mineIcon.offsetHeight / 2;
      set('--f0x', ix);
      set('--f0y', iy);
      set('--fx', mx - ix);
      set('--fy', my - iy);
      set('--g-x', mx - 27.8);
      set('--g-y', my - 60.8);
      const mk = splash.querySelector('.mk');
      const k = offIn(mk, screen);
      set('--k-x', mx - (k.x + mk.offsetWidth / 2));
      set('--k-y', my - (k.y + mk.offsetHeight / 2));
    },
  });
  stepItems[0].classList.add('on');
  c.pkPin = scene;
  if (lite) stage.classList.add('lite');
  return el;
}

// ---- 5.7 BOOKING
function bookingScene(c) {
  const { mode, eng } = c;
  const s = CAST.barber;
  const [fahd, sami] = staffData(s);
  const progress = (n) => h('div', { class: 'book-progress' }, [1, 2, 3, 4].map((k) => h('i', { class: k <= n ? 'on' : '' })));
  const vh3 = (key) => h('div', { class: 'vg-h', text: t(key) });
  const now = new Date();
  const dayChip = (offset, label) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return h('div', { class: `day-chip${offset === 1 ? ' on' : ''}` }, h('span', { class: 'dw', text: label ?? dayName(d.getDay()) }), h('span', { class: 'dn num', text: String(d.getDate()) }));
  };
  const receipt = (cls) => (cls === 'mini'
    ? h('div', { class: 'vg-rcpt mini' }, h('span', { class: 'ok' }, icon('check')), h('i'), h('i'), h('i'))
    : h('div', { class: 'vg-rcpt big', dir: 'ltr' }, h('span', { class: 'ok' }, icon('check')), h('b', { text: 'Transfer sent' }), h('strong', { text: '2.000 JOD' }), h('span', { text: 'To BARBERHOUSE' }), h('i'), h('i')));
  const next = () => h('div', { class: 'vg-next' }, t('book.next'));
  const VG = [
    () => [vh3('book.step_service'), progress(1), s.services.map((x, k) => h('div', { class: `vg-svc${k ? '' : ' sel'}` }, h('span', { class: 'tile emoji-tile', text: x.icon }), h('span', { class: 'grow' }, h('b', { text: pick(x, 'name') }), h('small', { text: fmtDuration(x.duration_min) })), h('b', { class: 'num', text: fmtPrice(x.price, 'JOD') }))), next()],
    () => [vh3('book.step_staff'), progress(2), h('div', { class: 'vg-picks' },
      h('div', { class: 'pick-card anyone' }, h('span', { class: 'tile' }, icon('sparkles')), h('span', { class: 'nm', text: t('book.anyone') }), h('span', { class: 'sub', text: t('book.anyone_sub') })),
      h('div', { class: 'pick-card' }, h('img', { class: 'avatar lg', src: fahd.photo_url, alt: '' }), h('span', { class: 'nm', text: pick(fahd, 'name') }), h('span', { class: 'sub', text: tx('senior') })),
      h('div', { class: 'pick-card' }, h('img', { class: 'avatar lg', src: sami.photo_url, alt: '' }), h('span', { class: 'nm', text: pick(sami, 'name') }), h('span', { class: 'sub', text: pick(s.services[0], 'name') }))), next()],
    () => [vh3('book.step_time'), progress(3), h('div', { class: 'vg-days' }, dayChip(0, tx('today')), dayChip(1, tx('tomorrow')), dayChip(2)),
      h('div', { class: 'slot-grid' }, ['16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30'].map((tm) => h('div', { class: `slot${tm === '18:00' ? ' on' : ''}`, 'data-t': fmtTime(tm), text: fmtTime(tm) }))), next()],
    () => [h('div', { class: 'card cliq-card' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'eyebrow', text: t('bk.deposit') }), h('div', { class: 'amount num', text: fmtPrice(2, 'JOD') })), h('div', { class: 'timer' }, h('span', { class: 'eyebrow', text: t('bk.expires_in') }), h('b', { class: 'num', text: '29:58' }))),
      h('div', { class: 'alias' }, h('span', { class: 'ltr', text: 'BARBERHOUSE' }), icon('copy')),
      h('div', { class: 'proof-drop' }, receipt('mini'), h('div', { class: 'vg-st' }, h('span', { class: 'pill status-pending_payment', text: t('status.pending_payment') }), h('span', { class: 'pill status-payment_sent', text: t('bk.payment_sent') }))))],
    () => [h('div', { class: 'vg-toast' }, icon('wallet'), h('span', { text: t('sched.payment_arrived') })), receipt('big'), h('p', { class: 'vg-warn', text: t('sched.review_hint') }),
      h('div', { class: 'vg-acts' }, h('div', { class: 'btn btn-secondary btn-sm', text: t('sched.reject') }), h('div', { class: 'btn btn-primary btn-sm vg-ok', text: t('sched.received') }))],
    () => [h('div', { class: 'vg-done' }, h('span', { class: 'vg-check' }, icon('check'), h('i', { class: 'mask' })), h('b', { text: t('bk.confirmed') }), h('span', { text: t('bk.see_you', { when: t('bk.tomorrow_at', { time: fmtTime('18:00') }) }) }),
      h('span', { class: 'vg-sum' }, icon('scissors'), `${pick(s.services[0], 'name')} · ${pick(fahd, 'name')}`))],
  ];
  const prints = tx('frames').map(([title, line], i) => {
    const salonSide = i === 4;
    const card = h(
      'article',
      { class: 'l-print', 'data-i': String(i), 'data-col': String(i % 3), style: { '--i': String(i % 3) }, 'data-theme': salonSide ? 'studio' : 'public', ...(salonSide ? { 'data-studio': 'brand' } : { 'data-page': 'night' }) },
      h('div', { class: 'pr-cur' }, h('div', { class: 'pr-in' },
        h('div', { class: 'pr-top' }, h('span', { class: 'pr-n', 'aria-hidden': 'true', text: pad(i + 1) }), h('span', { class: `pr-tag${salonSide ? ' salon' : ''}`, text: salonSide ? tx('tag_s') : tx('tag_c') })),
        h('div', { class: `pr-vg vg${i + 1}`, 'aria-hidden': 'true' }, VG[i]()),
        h('h3', { text: title }),
        h('p', { text: line }))),
    );
    return paintSalon(card, s);
  });
  const grid = h('div', { class: 'bk-grid' }, prints);
  const dots = h('div', { class: 'bk-dots', 'aria-hidden': 'true' }, prints.map((_, i) => h('i', { class: i ? '' : 'on' })), h('span', { text: tx('swipe') }));
  const ctaRow = c.wa ? h('p', { class: 'bk-cta' }, h('span', { text: tx('bk_q') }), h('a', { class: 'l-pill small', href: c.wa, target: '_blank', rel: 'noopener' }, icon('chat'), h('span', { text: tx('bk_a') }))) : null;
  const el = section(c, 'booking', 'ink', 'l-bk', sectionHead('booking', tx('bk_h2'), tx('bk_deck')), grid, dots, h('p', { class: 'l-note bk-note', text: tx('bk_note') }), ctaRow);
  c.bkCta = ctaRow;
  const develop = (p) => p.classList.add('dev');
  // The centred print on the phone strip develops as it arrives. The observer is rooted on the strip, so it
  // ignores the viewport: it starts only once the section is on screen, or print 01 would develop unseen.
  const observeStrip = () => {
    if (!('IntersectionObserver' in window)) return;
    const io = eng.observe(new IntersectionObserver((es) => {
      for (const e of es) {
        e.target.classList.toggle('on', e.isIntersecting);
        if (!e.isIntersecting) continue;
        if (innerWidth < 1024) develop(e.target);
        const i = Number(e.target.dataset.i);
        [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
      }
    }, { root: grid, threshold: 0.6 }));
    prints.forEach((p) => io.observe(p));
  };
  if (mode === 'still') {
    prints.forEach(develop);
    observeStrip();
  } else {
    eng.once(grid, () => {
      if (innerWidth >= 1024) prints.forEach(develop);
      observeStrip();
    }, innerWidth >= 1024 ? 0.3 : 0.5);
  }
  let wide = false;
  eng.add({
    el,
    kind: 'view',
    rigs: mode === 'full' ? prints.map((p) => ({ el: p, v: (x) => (wide ? x - 0.5 : 0) })) : [],
    measure(vw) {
      wide = vw >= 1024;
    },
  });
  return el;
}

// ---- 5.8 BACKSTAGE
function backstageScene(c) {
  const { mode, eng } = c;
  const s = CAST.barber;
  const data = salonData(s);
  const rows = tx('rows');
  const row = ([name, service, at], i) => h('div', { class: `bs-r${i === 3 ? ' fourth' : ''}` }, h('span', { class: 'tm num', text: fmtTime(at) }), h('span', { class: 'bd' }, h('b', { text: name }), h('small', { text: service })), h('i', { class: 'st' }));
  const dateText = new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const navIcons = ['home', 'calendar', 'scissors', 'users', 'clock', 'palette'];
  const frame = h(
    'div',
    { class: 'bs-frame rig', 'aria-hidden': 'true', 'data-theme': 'studio', 'data-studio': 'brand' },
    h('div', { class: 'bf-bar' }, h('i'), h('i'), h('i'), h('span', { class: 'url', dir: 'ltr', text: `${s.sub}.${c.domain}/admin` })),
    h('div', { class: 'bf-body' },
      h('div', { class: 'bf-side' }, h('div', { class: 'bf-id' }, salonIcon(data), h('b', { text: pick(s, 'name') })), tx('nav').map((n, i) => h('span', { class: i === 1 ? 'on' : '' }, icon(navIcons[i]), n))),
      h('div', { class: 'bf-main' },
        h('div', { class: 'bf-h' }, h('b', { text: `${tx('today')} · ${dateText}` })),
        h('div', { class: 'bf-days' }, [0, 1, 2, 3, 4].map((k) => h('span', { class: k ? '' : 'on', text: String(new Date(Date.now() + k * 864e5).getDate()) }))),
        h('div', { class: 'bf-now' }, h('span', { text: t('sched.now') }), h('i')),
        h('div', { class: 'bf-rows' }, rows.map(row)))),
  );
  paintSalon(frame, s);
  const ownerHome = (brandLook) => h(
    'div',
    { class: 'bs-home', 'data-theme': 'studio', ...(brandLook ? { 'data-studio': 'brand' } : {}) },
    h('div', { class: 'bh-top' }, salonIcon(data), h('div', null, h('span', { text: t('home.morning') }), h('b', { text: pick(s, 'name') }))),
    h('div', { class: 'bh-today' }, h('b', { text: tx('today_n') }), h('div', { class: 'bh-tl' }, h('i'), h('i'), h('i'), h('i'))),
    h('div', { class: 'bh-att' }, icon('wallet'), h('span', { text: t('sched.attention') }), h('b', { text: '1' })),
    h('div', { class: 'bh-quick' }, ['calendar', 'scissors', 'palette'].map((ic, i) => h('span', null, icon(ic), tx('nav')[[1, 2, 5][i]]))),
    h('div', { class: 'bh-next' }, icon('clock'), h('span', { text: t('home.next', { name: rows[3][0], time: fmtTime(rows[3][2]) }) })),
    h('div', { class: 'bh-list' }, rows.slice(0, 3).map(([name, service, at]) => h('div', null, h('b', { class: 'num', text: fmtTime(at) }), h('span', { text: `${name} · ${service}` })))),
  );
  const curtainIn = h('div', { class: 'bs-cin' }, ownerHome(true));
  const curtain = h('div', { class: 'bs-cur' }, curtainIn);
  const screen = h('div', { class: 'bs-scr' }, ownerHome(false), curtain);
  const ph = phone(screen, { scale: 0.7 });
  paintSalon(ph, s);
  const phoneRig = h('div', { class: 'bs-phone rig', 'aria-hidden': 'true' }, ph);
  const chip = h('div', { class: 'bs-live rig', 'aria-hidden': 'true' },
    h('span', { class: 'dot' }), h('span', { class: 'k', text: tx('live') }), h('span', { class: 'v' }, h('b', { text: tx('new_b') }), h('small', { text: `${rows[3][0]} · ${rows[3][1]} · ${fmtTime(rows[3][2])}` })));
  const pills = h('div', { class: 'bs-pills' }, h('span', { class: 'knob', 'aria-hidden': 'true' }), tx('bs_pills').map((p) => h('span', { class: 'p', text: p })));
  const inset = mode === 'still' ? h('div', { class: 'bs-inset', 'aria-hidden': 'true' }, phone(h('div', { class: 'bs-scr' }, ownerHome(false)), { scale: 0.34 })) : null;
  const look = h('div', { class: 'bs-look' }, inset, pills, h('p', { class: 'l-note', text: tx('bs_cap') }));
  const table = h('div', { class: 'bs-table' }, tx('bs_table').map(([title, line]) => h('div', { class: 'bs-row' }, h('h3', { text: title }), h('p', { text: line }))));
  const styles = ['natural', 'warm', 'mono', 'brand'];
  const tiles = styles.map((st, i) => h('figure', { class: `bs-tile rig t${i}` }, h('span', { class: 'im' }, h('img', { src: portraitSvg(st, s, 'beard'), alt: '' })), h('figcaption', { text: tx('styles')[i] })));
  const sheetEl = h('div', { class: 'bs-sheet' }, h('div', { class: 'bs-sh-h' }, h('h3', { text: tx('bs_sheet') }), h('p', { text: t('brand.style_sub') })), h('div', { class: 'bs-tiles' }, tiles));
  const mid = h('div', { class: 'bs-mid' }, phoneRig, chip);
  const stageArt = h('div', { class: 'bs-art' }, frame, mid, look);
  const el = section(c, 'backstage', 'paper', 'l-bs', h('div', { class: 'bs-grid' }, h('div', { class: 'bs-copy' }, sectionHead('backstage', tx('bs_h2'), tx('bs_deck')), table), stageArt), sheetEl);
  if (mode === 'still') el.classList.add('b1', 'b2');
  const k = mode === 'lite' ? 0.5 : 1;
  eng.add({
    el: stageArt,
    kind: 'view',
    rigs: mode === 'still' ? [] : [
      { el: frame, v: (p) => (0.5 - p) * k },
      { el: phoneRig, v: (p) => (0.5 - p) * k },
      { el: chip, v: (p) => (0.5 - p) * k },
    ],
  });
  // The beats follow the phone's own block (not the taller art box), so the colour curtain plays
  // while the phone is in view: b1 once it is fully on screen, b2 near the middle.
  if (mode !== 'still') {
    eng.add({
      el: mid,
      kind: 'view',
      beats: [0.32, 0.45],
      onBeat(i) {
        el.classList.toggle('b1', i >= 1);
        el.classList.toggle('b2', i >= 2);
      },
    });
  }
  eng.add({ el: sheetEl, kind: 'view', rigs: mode === 'still' ? [] : tiles.map((tile, i) => ({ el: tile, v: (p) => (i % 2 ? 1 : -1) * (p - 0.5) * k })) });
  if (mode === 'full') eng.once(sheetEl, () => sheetEl.classList.add('sheen'), 0.4);
  return el;
}

// ---- 5.9 HOW
function howScene(c) {
  const { mode, eng } = c;
  const line = h('i', { class: 'hw-line rig', 'aria-hidden': 'true' });
  const nums = [];
  const steps = c.wa ? tx('how_steps') : [tx('how_1_soon'), ...tx('how_steps').slice(1)];
  const cols = steps.map(([title, text], i) => {
    const n = h('span', { class: 'hw-n', 'aria-hidden': 'true', text: String(i + 1) });
    nums.push(n);
    return h('li', { class: 'hw-col' }, n, h('div', { class: 'tx' }, h('h3', { text: title }), h('p', { text })));
  });
  const list = h('ol', { class: 'hw-cols' }, line, cols);
  const el = section(c, 'how', 'ink', 'l-how', h('header', { class: 'l-head' }, folio(folioText('how')), heading('h2', tx('how_h2'))), list);
  let lit = -1;
  const light = (n) => {
    if (n === lit) return;
    lit = n;
    nums.forEach((x, i) => x.classList.toggle('on', i < n));
  };
  if (mode === 'still') light(3);
  eng.add({
    el,
    kind: 'view',
    rigs: mode === 'still' ? [] : [{ el: line, v: (p) => seg(p, 0.1, 0.4) }],
    // Numeral i lights as the drawn line passes i/3.
    onP: mode === 'still' ? null : (p) => {
      const v = seg(p, 0.1, 0.4);
      light(v <= 0 ? 0 : Math.min(3, Math.floor(v * 3) + 1));
    },
  });
  eng.once(list, () => list.classList.add('in'), 0.2);
  return el;
}

// ---- 5.10 FINALE + COLOPHON
function finaleScene(c) {
  const { mode, eng } = c;
  const N = mode === 'lite' ? 20 : 28;
  const ring = bulbRing(N, c.xs, 'fn-b');
  const moons = [CAST.lamar, CAST.barber, CAST.rana, CAST.joud, CAST.corner].map((s, i) => {
    const m = h('span', { class: 'fn-moon', style: { '--a': `${i * 72}deg` } }, h('span', { class: 'up' }, salonIcon(salonData(s))));
    paintSalon(m, s);
    return m;
  });
  const tile = h('span', { class: 'fn-tile' }, h('span', { class: 'sc' }, scissorsMark()), h('span', { class: 'lb', text: tx('logo_here') }));
  // The moons ride a flattened orbit around the mirror and stay upright as it turns.
  const ringEl = h('span', { class: 'fn-ring rig' }, h('span', { class: 'fn-glow' }), ring.groups, tile, h('span', { class: 'fn-orbit' }, h('span', { class: 'fn-spin' }, moons)));
  const [a, b] = tx('fn_h2');
  const h2 = h('h2', { class: 'fn-h2', tabindex: '-1' }, h('span', { class: 'ln' }, h('span', { text: a })), ' ', h('span', { class: 'fn-ringbox', 'aria-hidden': 'true' }, ringEl), ' ', h('span', { class: 'ln' }, h('span', { text: b })));
  const cta = c.wa ? c.cta('fn-cta', tx('cta'), 'get-app') : h('p', { class: 'l-soon big', text: tx('soon') });
  const el = section(c, 'finale', 'ink', 'l-fn', h('div', { class: 'fn-in' }, folio(folioText('finale')), h2, h('p', { class: 'l-deck', text: tx(c.wa ? 'fn_deck' : 'fn_deck_soon') }), cta));
  c.fnCta = cta;
  let lit = -1;
  const light = (n) => {
    if (n === lit) return;
    for (let i = Math.min(n, Math.max(0, lit)); i < Math.max(n, lit); i++) ring.all[i]?.classList.toggle('on', n > lit);
    lit = n;
    el.classList.toggle('lit', n >= N);
  };
  if (mode === 'still') {
    light(N);
    el.classList.add('rise');
  }
  eng.add({
    el,
    kind: 'view',
    rigs: mode === 'still' ? [] : [{ el: ringEl, v: (p) => seg(p, 0, 0.4) }],
    // Fully lit just before the section's centre reaches the screen's, while the heading is still well in view.
    onP: mode === 'still' ? null : (p) => light(Math.min(N, Math.ceil(seg(p, 0.08, 0.42) * N - 1e-6))),
  });
  // The h2 holds the tall ring box, so a low threshold: the heading rises as its first line enters.
  eng.once(h2, () => el.classList.add('rise'), 0.15);
  return el;
}

function footer(c, langBtn) {
  return h(
    'footer',
    { class: 'l-foot' },
    h(
      'div',
      { class: 'lf-top' },
      h('div', { class: 'lf-brand' }, lockup(c.brand, 'big'), h('p', { text: tx('col_line') })),
      h('p', { class: 'lf-owner', text: tx('owner', { path: ltr('/admin') }) }),
      legalLinks('lf-legal'),
    ),
    h('div', { class: 'lf-bot' }, h('span', { text: `© ${new Date().getFullYear()} ${c.brand}` }), h('span', { text: tx('examples') }), langBtn()),
  );
}

// §8 landingView
export function landingView(app, opts = {}) {
  const tenant = app.ctx.tenant;
  const rtl = getLang() === 'ar';
  let mode = opts.mode || motionMode();
  const view = h('div', { class: 'land', 'data-motion': mode });
  view.style.setProperty('--x-start', rtl ? '1' : '-1');
  const eng = createEngine(view, mode);
  const wa = tenant.contact_phone ? `https://wa.me/${waNumber(tenant.contact_phone)}?text=${encodeURIComponent(tx('wa_text'))}` : null;
  let rebuilt = false;
  const rebuild = (nextMode) => {
    if (rebuilt || eng.stopped) return;
    rebuilt = true;
    const at = eng.anchor();
    eng.stop();
    const fresh = landingView(app, { restore: at, mode: nextMode });
    view.replaceWith(fresh);
  };
  const c = {
    app, tenant, mode, eng, rtl, xs: rtl ? 1 : -1, wa, view, sections: [],
    brand: pick(tenant, 'name'), domain: tenant.domain,
    ready: Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 600))]),
    cta: (cls, label = tx('cta'), id) => (wa ? h('a', { class: `btn btn-primary sheen l-pill ${cls}`, id, href: wa, target: '_blank', rel: 'noopener' }, icon('chat'), h('span', { text: label })) : null),
    go(id) {
      const m = eng.marks.find((x) => x.id === id);
      if (!m) return;
      window.scrollTo({ top: m.top + (m.pin ? 2 : 0), behavior: mode === 'still' ? 'auto' : 'smooth' });
    },
    toggleLang() {
      if (rebuilt) return;
      rebuilt = true;
      const ae = document.activeElement;
      const refocus = ae?.closest?.('.l-lang') ? (ae.closest('.l-foot') ? '.l-foot .l-lang' : '.l-top .l-lang') : null;
      const at = eng.anchor();
      setLang(getLang() === 'ar' ? 'en' : 'ar');
      eng.stop();
      const fresh = landingView(app, { restore: at });
      view.replaceWith(fresh);
      // Keyboard focus stays on the same button in the new view (the restore keeps the scroll position).
      if (refocus) fresh.querySelector(refocus)?.focus({ preventScroll: true });
    },
  };
  const ui = chrome(c);
  eng.chrome = ui.update;
  const main = h(
    'main',
    { class: 'l-main' },
    coverScene(c),
    letterScene(c),
    whiteLabelScene(c),
    collectionScene(c),
    tryScene(c),
    pocketScene(c),
    bookingScene(c),
    backstageScene(c),
    howScene(c),
    finaleScene(c),
  );
  const foot = footer(c, ui.langBtn);
  view.append(ui.skip, ui.bar, main, foot, ui.fab ?? '');
  // Pages laid over pages: a section whose tone differs from the one before it.
  c.sections.forEach((s, i) => {
    s.el.style.setProperty('--z', String(i + 1));
    const prev = c.sections[i - 1];
    if (prev && prev.tone !== s.tone && !(s.id === 'letter' && mode !== 'still')) s.el.classList.add('over');
    eng.mark(s.el, s.id, s.tone, s.id === 'cover' ? c.coverScene : s.id === 'white-label' ? c.wlPin : s.id === 'pocket' ? c.pkPin : null);
  });
  ui.watchBlockers([c.trySec, c.bkCta, c.fnCta, foot]);

  eng.onError = () => (mode === 'still' ? null : rebuild('still'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const onReduce = () => rebuild();
  reduce.addEventListener?.('change', onReduce);
  app.onUnmount(() => {
    reduce.removeEventListener?.('change', onReduce);
    eng.stop();
  });
  eng.onLite.push(() => {
    mode = 'lite';
  });
  const begin = () => {
    if (eng.stopped) return;
    if (!view.isConnected) {
      requestAnimationFrame(begin);
      return;
    }
    try {
      eng.start();
      if (opts.restore) eng.restore(opts.restore);
      c.ready.then(() => {
        eng.measure();
        if (opts.restore) eng.restore(opts.restore);
      });
      document.fonts?.ready.then(() => eng.measure());
    } catch {
      if (mode !== 'still') rebuild('still');
    }
    appReady();
  };
  requestAnimationFrame(begin);
  return view;
}

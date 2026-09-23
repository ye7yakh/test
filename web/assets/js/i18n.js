// Every piece of UI text lives here, Arabic first. Numbers always use Western digits.

const STRINGS = {
  ar: {
    'app.loading': 'جارٍ التحميل…',
    'app.lang': 'English',
    save: 'حفظ',
    saved: 'تم الحفظ',
    cancel: 'إلغاء',
    close: 'إغلاق',
    delete: 'حذف',
    add: 'إضافة',
    optional: 'اختياري',
    logout: 'تسجيل الخروج',
    retry: 'إعادة المحاولة',
    'confirm.delete': 'هل أنت متأكد من الحذف؟ لا يمكن التراجع.',
    'confirm.yes': 'نعم، احذف',

    'err.network': 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.',
    'err.server_error': 'حدث خطأ غير متوقع. حاول مجددًا.',
    'err.bad_credentials': 'رقم الجوال أو كلمة المرور غير صحيحة.',
    'err.too_many_attempts': 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
    'err.login_required': 'انتهت الجلسة. سجّل الدخول مجددًا.',
    'err.forbidden': 'ليست لديك صلاحية لهذا الإجراء.',
    'err.not_found': 'العنصر غير موجود.',
    'err.invalid': 'تحقق من الحقل: {field}',
    'err.required': 'هذا الحقل مطلوب: {field}',
    'err.weak_password': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
    'err.wrong_password': 'كلمة المرور الحالية غير صحيحة.',
    'err.subdomain_taken': 'هذا الرابط مستخدم لصالون آخر.',
    'err.unsupported_image': 'الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.',
    'err.image_too_small': 'الصورة صغيرة جدًا. اختر صورة أوضح.',
    'err.too_large': 'الملف كبير جدًا.',
    'err.hours_overlap': 'الفترات متداخلة في يوم {day}.',
    'err.conflict': 'هذا العنصر موجود مسبقًا.',
    'err.bad_origin': 'طلب غير مسموح.',

    'login.title': 'دخول صاحب الصالون',
    'login.platform': 'لوحة إدارة المنصة',
    'login.phone': 'رقم الجوال',
    'login.password': 'كلمة المرور',
    'login.submit': 'دخول',
    'login.back': 'العودة لصفحة الصالون',

    'pub.services': 'الخدمات',
    'pub.team': 'فريقنا',
    'pub.hours': 'أوقات العمل',
    'pub.contact': 'التواصل',
    'pub.closed': 'مغلق',
    'pub.open_now': 'مفتوح الآن · حتى {time}',
    'pub.closed_now': 'مغلق الآن',
    'pub.from': 'يبدأ من',
    'pub.book': 'الحجز الإلكتروني قريبًا',
    'pub.call': 'اتصال',
    'pub.manage': 'إدارة الصالون',
    'pub.owner_login': 'دخول صاحب الصالون',
    'pub.empty': 'الصالون يجهّز صفحته. عُد قريبًا.',

    'tab.salon': 'الصالون',
    'tab.services': 'الخدمات',
    'tab.team': 'الفريق',
    'tab.hours': 'الأوقات',
    'manage.view_page': 'عرض صفحتي',
    'manage.setup': 'تجهيز الصالون: {done} من 4',
    'manage.setup_done': 'صالونك جاهز لاستقبال العملاء',

    'salon.info': 'معلومات الصالون',
    'salon.name_ar': 'اسم الصالون',
    'salon.name_en': 'الاسم بالإنجليزية',
    'salon.about_ar': 'نبذة قصيرة',
    'salon.about_en': 'نبذة بالإنجليزية',
    'salon.phone': 'رقم التواصل',
    'salon.address': 'العنوان',
    'salon.look': 'الشكل والألوان',
    'salon.look_help': 'تظهر في تطبيق صالونك وأيقونته على جوالات العملاء.',
    'salon.logo': 'الشعار',
    'salon.logo_upload': 'رفع الشعار',
    'salon.logo_change': 'تغيير',
    'salon.logo_remove': 'إزالة',
    'salon.logo_hint': 'صورة مربعة بخلفية فاتحة تعطي أفضل نتيجة.',
    'salon.palettes': 'ألوان جاهزة',
    'salon.color_primary': 'اللون الأساسي',
    'salon.color_accent': 'لون التمييز',
    'salon.photo_style': 'نمط صور الفريق',
    'salon.photo_style_help': 'نوحّد صور فريقك تلقائيًا: نفس القصّ حول الوجه، نفس الإضاءة، ونفس الألوان.',
    'style.natural': 'طبيعي',
    'style.warm': 'دافئ',
    'style.mono': 'أبيض وأسود',
    'style.brand': 'بلون الصالون',
    'salon.region': 'المنطقة والعملة',
    'salon.timezone': 'المنطقة الزمنية',
    'salon.currency': 'العملة',
    'salon.account': 'الحساب',
    'salon.password_current': 'كلمة المرور الحالية',
    'salon.password_next': 'كلمة المرور الجديدة',
    'salon.password_change': 'تغيير كلمة المرور',
    'salon.password_changed': 'تم تغيير كلمة المرور',

    'services.title': 'الخدمات',
    'services.add': 'خدمة جديدة',
    'services.edit': 'تعديل الخدمة',
    'services.empty': 'أضف أول خدمة يقدّمها صالونك، مثل قص الشعر أو حلاقة الذقن.',
    'services.name_ar': 'اسم الخدمة',
    'services.name_en': 'الاسم بالإنجليزية',
    'services.description_ar': 'وصف قصير',
    'services.duration': 'المدة (دقيقة)',
    'services.price': 'السعر',
    'services.price_is_from': 'السعر يبدأ من (يختلف حسب الطلب)',
    'services.active': 'متاحة للحجز',
    'services.hidden': 'مخفية',
    'services.staff': 'من يقدّم هذه الخدمة؟',
    'services.no_staff': 'أضف فريقك من تبويب «الفريق» لتحديد من يقدّم الخدمة.',
    'services.reorder': 'ترتيب',
    'services.reorder_done': 'تم',

    'team.title': 'الفريق',
    'team.add': 'عضو جديد',
    'team.edit': 'تعديل العضو',
    'team.empty': 'أضف الحلاقين والمصففين في صالونك مع صورهم.',
    'team.name_ar': 'الاسم',
    'team.name_en': 'الاسم بالإنجليزية',
    'team.title_ar': 'المسمى',
    'team.title_placeholder': 'مثال: حلاق أول',
    'team.title_en': 'المسمى بالإنجليزية',
    'team.photo': 'الصورة',
    'team.photo_upload': 'رفع صورة',
    'team.photo_change': 'تغيير الصورة',
    'team.photo_remove': 'إزالة',
    'team.photo_hint': 'صورة واضحة للوجه والكتفين. نحوّلها تلقائيًا لنمط الصالون الموحّد.',
    'team.photo_original': 'الأصلية',
    'team.photo_styled': 'بعد التوحيد',
    'team.photo_after_save': 'احفظ العضو أولًا ثم أضف صورته.',
    'team.services': 'الخدمات التي يقدّمها',
    'team.no_services': 'أضف الخدمات من تبويب «الخدمات».',
    'team.hours': 'أوقات العمل',
    'team.hours_salon': 'أوقات الصالون',
    'team.hours_custom': 'أوقات خاصة',
    'team.active': 'يستقبل حجوزات',
    'team.inactive': 'موقوف',
    'team.services_count': '{n} خدمات',

    'hours.title': 'أوقات العمل',
    'hours.help': 'حدد أيام وساعات العمل. يمكنك إضافة أكثر من فترة في اليوم، مثل فترة صباحية ومسائية.',
    'hours.closed': 'مغلق',
    'hours.add_range': 'إضافة فترة',
    'hours.copy_all': 'تطبيق على كل الأيام',
    'hours.copied': 'تم النسخ لكل الأيام',
    'hours.next_day': 'اليوم التالي',
    'hours.to': 'إلى',

    'admin.title': 'الصالونات',
    'admin.new': 'صالون جديد',
    'admin.empty': 'لا توجد صالونات بعد.',
    'admin.subdomain': 'رابط الصالون',
    'admin.subdomain_hint': 'حروف إنجليزية صغيرة وأرقام فقط، مثل elite',
    'admin.name_ar': 'اسم الصالون',
    'admin.name_en': 'الاسم بالإنجليزية',
    'admin.owner_name': 'اسم المالك',
    'admin.owner_phone': 'جوال المالك',
    'admin.owner_password': 'كلمة مرور مؤقتة للمالك',
    'admin.owner_password_hint': 'يمكن للمالك تغييرها لاحقًا. تُتجاهل إن كان للرقم حساب مسبق.',
    'admin.create': 'إنشاء الصالون',
    'admin.created': 'تم إنشاء الصالون',
    'admin.open': 'فتح',
    'admin.active': 'فعّال',
    'admin.suspended': 'موقوف',
    'admin.owners': 'المالك',

    'unit.min': '{n} دقيقة',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  },
  en: {
    'app.loading': 'Loading…',
    'app.lang': 'العربية',
    save: 'Save',
    saved: 'Saved',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    add: 'Add',
    optional: 'optional',
    logout: 'Log out',
    retry: 'Try again',
    'confirm.delete': 'Delete this? This cannot be undone.',
    'confirm.yes': 'Yes, delete',

    'err.network': 'Could not connect. Check your internet and try again.',
    'err.server_error': 'Something went wrong. Please try again.',
    'err.bad_credentials': 'Wrong phone number or password.',
    'err.too_many_attempts': 'Too many attempts. Wait a little and try again.',
    'err.login_required': 'Your session ended. Please log in again.',
    'err.forbidden': 'You are not allowed to do that.',
    'err.not_found': 'Not found.',
    'err.invalid': 'Please check: {field}',
    'err.required': 'Required: {field}',
    'err.weak_password': 'Password must be at least 8 characters.',
    'err.wrong_password': 'Current password is wrong.',
    'err.subdomain_taken': 'That link is already used by another salon.',
    'err.unsupported_image': 'Unsupported image. Use JPG, PNG or WebP.',
    'err.image_too_small': 'The image is too small. Pick a clearer one.',
    'err.too_large': 'The file is too large.',
    'err.hours_overlap': 'Time ranges overlap on {day}.',
    'err.conflict': 'This already exists.',
    'err.bad_origin': 'Request not allowed.',

    'login.title': 'Salon owner login',
    'login.platform': 'Platform admin',
    'login.phone': 'Phone number',
    'login.password': 'Password',
    'login.submit': 'Log in',
    'login.back': 'Back to the salon page',

    'pub.services': 'Services',
    'pub.team': 'Our team',
    'pub.hours': 'Opening hours',
    'pub.contact': 'Contact',
    'pub.closed': 'Closed',
    'pub.open_now': 'Open now · until {time}',
    'pub.closed_now': 'Closed now',
    'pub.from': 'from',
    'pub.book': 'Online booking coming soon',
    'pub.call': 'Call',
    'pub.manage': 'Manage salon',
    'pub.owner_login': 'Salon owner login',
    'pub.empty': 'This salon is setting up its page. Check back soon.',

    'tab.salon': 'Salon',
    'tab.services': 'Services',
    'tab.team': 'Team',
    'tab.hours': 'Hours',
    'manage.view_page': 'View my page',
    'manage.setup': 'Salon setup: {done} of 4',
    'manage.setup_done': 'Your salon is ready for customers',

    'salon.info': 'Salon details',
    'salon.name_ar': 'Salon name (Arabic)',
    'salon.name_en': 'Name in English',
    'salon.about_ar': 'Short intro (Arabic)',
    'salon.about_en': 'Short intro (English)',
    'salon.phone': 'Contact number',
    'salon.address': 'Address',
    'salon.look': 'Look and colours',
    'salon.look_help': "Used in your salon's app and its icon on customers' phones.",
    'salon.logo': 'Logo',
    'salon.logo_upload': 'Upload logo',
    'salon.logo_change': 'Change',
    'salon.logo_remove': 'Remove',
    'salon.logo_hint': 'A square logo on a light background works best.',
    'salon.palettes': 'Ready palettes',
    'salon.color_primary': 'Main colour',
    'salon.color_accent': 'Accent colour',
    'salon.photo_style': 'Team photo style',
    'salon.photo_style_help': 'We unify your team photos automatically: same crop around the face, same lighting, same colours.',
    'style.natural': 'Natural',
    'style.warm': 'Warm',
    'style.mono': 'Black & white',
    'style.brand': 'Salon colour',
    'salon.region': 'Region and currency',
    'salon.timezone': 'Time zone',
    'salon.currency': 'Currency',
    'salon.account': 'Account',
    'salon.password_current': 'Current password',
    'salon.password_next': 'New password',
    'salon.password_change': 'Change password',
    'salon.password_changed': 'Password changed',

    'services.title': 'Services',
    'services.add': 'New service',
    'services.edit': 'Edit service',
    'services.empty': 'Add the first service your salon offers, like a haircut or beard trim.',
    'services.name_ar': 'Service name (Arabic)',
    'services.name_en': 'Name in English',
    'services.description_ar': 'Short description',
    'services.duration': 'Duration (minutes)',
    'services.price': 'Price',
    'services.price_is_from': 'Price starts from (varies)',
    'services.active': 'Bookable',
    'services.hidden': 'Hidden',
    'services.staff': 'Who offers this service?',
    'services.no_staff': 'Add your team in the Team tab to choose who offers it.',
    'services.reorder': 'Reorder',
    'services.reorder_done': 'Done',

    'team.title': 'Team',
    'team.add': 'New member',
    'team.edit': 'Edit member',
    'team.empty': "Add your salon's barbers and stylists with their photos.",
    'team.name_ar': 'Name (Arabic)',
    'team.name_en': 'Name in English',
    'team.title_ar': 'Title (Arabic)',
    'team.title_placeholder': 'e.g. Senior barber',
    'team.title_en': 'Title in English',
    'team.photo': 'Photo',
    'team.photo_upload': 'Upload photo',
    'team.photo_change': 'Change photo',
    'team.photo_remove': 'Remove',
    'team.photo_hint': "A clear head-and-shoulders photo. We restyle it to the salon's unified look.",
    'team.photo_original': 'Original',
    'team.photo_styled': 'Unified',
    'team.photo_after_save': 'Save the member first, then add a photo.',
    'team.services': 'Services they offer',
    'team.no_services': 'Add services in the Services tab.',
    'team.hours': 'Working hours',
    'team.hours_salon': 'Salon hours',
    'team.hours_custom': 'Own hours',
    'team.active': 'Takes bookings',
    'team.inactive': 'Paused',
    'team.services_count': '{n} services',

    'hours.title': 'Opening hours',
    'hours.help': 'Set your working days and hours. A day can have more than one range, like a morning and an evening shift.',
    'hours.closed': 'Closed',
    'hours.add_range': 'Add range',
    'hours.copy_all': 'Apply to all days',
    'hours.copied': 'Copied to all days',
    'hours.next_day': 'next day',
    'hours.to': 'to',

    'admin.title': 'Salons',
    'admin.new': 'New salon',
    'admin.empty': 'No salons yet.',
    'admin.subdomain': 'Salon link',
    'admin.subdomain_hint': 'Lowercase English letters and digits, e.g. elite',
    'admin.name_ar': 'Salon name (Arabic)',
    'admin.name_en': 'Name in English',
    'admin.owner_name': 'Owner name',
    'admin.owner_phone': 'Owner phone',
    'admin.owner_password': 'Temporary owner password',
    'admin.owner_password_hint': 'The owner can change it later. Ignored if the number already has an account.',
    'admin.create': 'Create salon',
    'admin.created': 'Salon created',
    'admin.open': 'Open',
    'admin.active': 'Active',
    'admin.suspended': 'Suspended',
    'admin.owners': 'Owner',

    'unit.min': '{n} min',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
};

// The week as people in the region read it: Saturday first.
export const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

let lang = 'ar';
try {
  const stored = localStorage.getItem('lang');
  if (stored === 'ar' || stored === 'en') lang = stored;
} catch {}

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {}
  applyLang();
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.ar[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

export const dayName = (weekday) => t('days')[weekday];

/** Picks the field in the current language, falling back to Arabic: pick(service, 'name'). */
export function pick(obj, base) {
  return (lang === 'en' && obj[`${base}_en`]) || obj[`${base}_ar`] || obj[`${base}_en`] || '';
}

const LOCALE = () => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn');

export function fmtPrice(price, currency) {
  const n = Number(price);
  const decimals = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat(LOCALE(), {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(LOCALE(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(
    Date.UTC(2000, 0, 1, h, m),
  );
}

export const fmtDuration = (min) => t('unit.min', { n: min });

/** Arabic-Indic digits and the Arabic decimal separator to what the API expects. */
export function westernDigits(s) {
  return String(s)
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[٫،]/g, '.');
}

const FIELD_LABELS = {
  name_ar: 'salon.name_ar',
  phone: 'login.phone',
  password: 'login.password',
  subdomain: 'admin.subdomain',
  owner_phone: 'admin.owner_phone',
  owner_password: 'admin.owner_password',
  duration_min: 'services.duration',
  price: 'services.price',
  current: 'salon.password_current',
  next: 'salon.password_next',
};

export function errorText(err) {
  const code = err?.code ?? 'server_error';
  const field = err?.field ?? '';
  const day = /\.(\d)$/.exec(field);
  const key = STRINGS.ar[`err.${code}`] ? `err.${code}` : 'err.server_error';
  return t(key, {
    field: FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field,
    day: day ? dayName(Number(day[1])) : '',
  });
}

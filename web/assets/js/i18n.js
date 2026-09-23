// Every piece of UI text lives here, Arabic first. Numbers always use Western digits.
// A value can be a plural table ({ zero, one, two, few, many, other }), picked by
// Intl.PluralRules for the current language.

const STRINGS = {
  ar: {
    'app.lang': 'English',
    save: 'حفظ',
    saved: 'تم الحفظ',
    cancel: 'إلغاء',
    close: 'إغلاق',
    delete: 'حذف',
    add: 'إضافة',
    edit: 'تعديل',
    done: 'تم',
    optional: 'اختياري',
    logout: 'تسجيل الخروج',
    retry: 'إعادة المحاولة',
    copy: 'نسخ',
    copied: 'تم نسخ الرابط',
    share: 'مشاركة',
    discard: 'تجاهل',
    unsaved: 'لديك تغييرات غير محفوظة',
    'confirm.title': 'حذف نهائي؟',
    'confirm.delete': 'لا يمكن التراجع عن الحذف.',
    'confirm.yes': 'نعم، احذف',

    'err.network': 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.',
    'err.server_error': 'حدث خطأ غير متوقع. حاول مجددًا.',
    'err.bad_credentials': 'رقم الجوال أو كلمة المرور غير صحيحة.',
    'err.too_many_attempts': 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
    'err.login_required': 'انتهت الجلسة. سجّل الدخول مجددًا.',
    'err.forbidden': 'ليست لديك صلاحية لهذا الإجراء.',
    'err.not_found': 'العنصر غير موجود.',
    'err.invalid': 'تحقق من: {field}',
    'err.required': 'مطلوب: {field}',
    'err.weak_password': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
    'err.wrong_password': 'كلمة المرور الحالية غير صحيحة.',
    'err.subdomain_taken': 'هذا الرابط مستخدم لصالون آخر.',
    'err.unsupported_image': 'الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.',
    'err.image_too_small': 'الصورة صغيرة جدًا. اختر صورة أوضح.',
    'err.too_large': 'الملف كبير جدًا.',
    'err.hours_overlap': 'الفترات متداخلة يوم {day}.',
    'err.conflict': 'هذا العنصر موجود مسبقًا.',
    'err.bad_origin': 'طلب غير مسموح.',

    'login.welcome': 'مرحبًا بعودتك',
    'login.studio': 'ادخل إلى استوديو {name}',
    'login.platform': 'لوحة إدارة المنصة',
    'login.phone': 'رقم الجوال',
    'login.password': 'كلمة المرور',
    'login.show': 'إظهار كلمة المرور',
    'login.submit': 'دخول',
    'login.back': 'صفحة الصالون',

    'nav.home': 'الرئيسية',
    'nav.brand': 'الهوية',
    'nav.services': 'الخدمات',
    'nav.team': 'الفريق',
    'nav.hours': 'الأوقات',
    'nav.settings': 'الإعدادات',
    'nav.preview': 'معاينة',

    'home.morning': 'صباح الخير',
    'home.evening': 'مساء الخير',
    'home.progress': 'جاهزية تطبيقك',
    'home.left': { one: 'بقيت خطوة واحدة لإطلاق تطبيق صالونك.', two: 'بقيت خطوتان لإطلاق تطبيق صالونك.', few: 'بقيت {n} خطوات لإطلاق تطبيق صالونك.', other: 'بقيت {n} خطوة لإطلاق تطبيق صالونك.' },
    'home.continue': 'متابعة التجهيز',
    'home.ready': 'تطبيقك جاهز',
    'home.ready_sub': 'صالونك جاهز لاستقبال العملاء. شارك الرابط معهم.',
    'home.steps': 'خطوات التجهيز',
    'step.brand': 'الهوية والشعار',
    'step.brand_sub': 'شعارك وألوانك في تطبيقك',
    'step.services': 'الخدمات والأسعار',
    'step.services_sub': 'ما تقدّمه وبكم',
    'step.team': 'فريق العمل',
    'step.team_sub': 'الحلاقون والمصففون',
    'step.photos': 'صور الفريق',
    'step.photos_sub': 'صورة لكل عضو بلمسة الاستوديو',
    'home.glance': 'نظرة سريعة',
    'home.services': { zero: 'خدمات', one: 'خدمة', two: 'خدمتان', few: 'خدمات', other: 'خدمة' },
    'home.members': { other: 'في الفريق' },
    'home.open_now': 'مفتوح الآن',
    'home.closed_now': 'مغلق الآن',
    'home.until': 'حتى {time}',
    'home.link': 'رابط تطبيقك',
    'home.link_sub': 'شاركه مع عملائك أو ضعه في حسابك على إنستغرام.',
    'home.share_text': 'احجز موعدك في {name}',

    'brand.title': 'هوية صالونك',
    'brand.sub': 'كل ما تغيّره هنا يظهر مباشرة في تطبيقك.',
    'brand.slide_app': 'تطبيقك',
    'brand.slide_home': 'على جوال عميلك',
    'brand.name': 'اسم الصالون',
    'brand.name_en': 'الاسم بالإنجليزية',
    'brand.logo': 'الشعار',
    'brand.logo_hint': 'PNG أو JPG، ويفضّل بخلفية شفافة أو فاتحة.',
    'brand.logo_upload': 'رفع الشعار',
    'brand.logo_change': 'تغيير',
    'brand.logo_remove': 'إزالة',
    'brand.colors': 'الألوان',
    'brand.colors_sub': 'اختر لوحة جاهزة أو لونيك الخاصين.',
    'brand.primary': 'اللون الأساسي',
    'brand.primary_sub': 'خلفية تطبيقك وأيقونته',
    'brand.accent': 'لون التمييز',
    'brand.accent_sub': 'الأزرار واللمسات',
    'brand.style': 'لمسة الاستوديو',
    'brand.style_sub': 'نوحّد صور فريقك تلقائيًا: نفس القص حول الوجه، ونفس الإضاءة، ونفس الألوان.',
    'brand.saved': 'تم حفظ الهوية',
    'style.natural': 'طبيعي',
    'style.warm': 'دافئ',
    'style.mono': 'أبيض وأسود',
    'style.brand': 'بلون الصالون',
    'pal.violet': 'بنفسجي ليلي',
    'pal.ocean': 'أزرق محيطي',
    'pal.classic': 'كلاسيكي',
    'pal.gold': 'ذهبي ملكي',
    'pal.copper': 'نحاسي',
    'pal.emerald': 'زمرّدي',
    'pal.burgundy': 'عنّابي',
    'pal.coral': 'مرجاني',
    'pal.sage': 'زيتوني',
    'pal.rose': 'وردي',
    'pal.lavender': 'لافندر',
    'pal.white': 'أبيض أنيق',
    'pal.sand': 'رملي',

    'services.title': 'الخدمات',
    'services.sub': 'قائمة خدماتك وأسعارها كما يراها عملاؤك.',
    'services.quick': 'ابدأ بقائمة جاهزة',
    'services.quick_sub': 'اختر نوع صالونك ونقترح عليك الخدمات الأكثر طلبًا. تعدّلها كما تشاء.',
    'services.manual': 'أو أضف خدمة بنفسك',
    'services.more': 'أضف من القوائم الجاهزة',
    'type.barber': 'حلاقة رجالية',
    'type.ladies': 'صالون نسائي',
    'type.spa': 'سبا وعناية',
    'services.tpl_sub': 'اختر ما تقدّمه وحدد سعرك لكل خدمة.',
    'services.tpl_add': { zero: 'اختر خدمة واحدة على الأقل', one: 'إضافة خدمة واحدة', two: 'إضافة خدمتين', few: 'إضافة {n} خدمات', other: 'إضافة {n} خدمة' },
    'services.tpl_price': 'السعر',
    'services.added': 'تمت إضافة الخدمات',
    'services.add': 'خدمة جديدة',
    'services.edit': 'تعديل الخدمة',
    'services.name': 'اسم الخدمة',
    'services.name_en': 'الاسم بالإنجليزية',
    'services.desc': 'وصف قصير',
    'services.icon': 'الأيقونة',
    'services.duration': 'المدة',
    'services.price': 'السعر',
    'services.from': 'السعر يبدأ من',
    'services.from_sub': 'حين يختلف السعر حسب الطول أو الطلب',
    'services.bookable': 'متاحة للحجز',
    'services.bookable_sub': 'أوقفها مؤقتًا دون حذفها',
    'services.who': 'من يقدّمها؟',
    'services.no_team': 'أضف فريقك لتحدد من يقدّم كل خدمة.',
    'services.hidden': 'مخفية',
    'services.reorder': 'ترتيب',
    'services.custom': 'مدة أخرى',

    'team.title': 'الفريق',
    'team.sub': 'الحلاقون والمصففون في صالونك، بصور موحّدة.',
    'team.add': 'عضو جديد',
    'team.edit': 'تعديل العضو',
    'team.photo_add': 'أضف صورة',
    'team.photo_add_sub': 'صورة واضحة للوجه والكتفين',
    'team.photo_change': 'تغيير الصورة',
    'team.photo_remove': 'إزالة',
    'team.processing': 'نضيف لمسة الاستوديو…',
    'team.studio': 'لمسة الاستوديو',
    'team.name': 'الاسم',
    'team.role': 'المسمى',
    'team.role_ph': 'مثال: حلاق أول',
    'team.name_en': 'الاسم بالإنجليزية',
    'team.role_en': 'المسمى بالإنجليزية',
    'team.services': 'الخدمات التي يقدّمها',
    'team.no_services': 'أضف الخدمات أولًا من صفحة الخدمات.',
    'team.hours': 'أوقات العمل',
    'team.hours_salon': 'أوقات الصالون',
    'team.hours_own': 'أوقات خاصة',
    'team.active': 'يستقبل حجوزات',
    'team.active_sub': 'أوقفه مؤقتًا في الإجازات',
    'team.paused': 'متوقف',
    'team.services_n': { zero: 'بدون خدمات', one: 'خدمة واحدة', two: 'خدمتان', few: '{n} خدمات', other: '{n} خدمة' },

    'hours.title': 'أوقات العمل',
    'hours.sub': 'متى يفتح صالونك؟ يمكنك إضافة أكثر من فترة في اليوم.',
    'hours.presets': 'قوالب سريعة',
    'preset.full': '10ص – 10م',
    'preset.split': 'فترتين',
    'preset.night': 'حتى 2 بعد منتصف الليل',
    'preset.friday': 'الجمعة بعد الصلاة',
    'hours.closed': 'مغلق',
    'hours.open': 'مفتوح',
    'hours.add_range': 'إضافة فترة',
    'hours.copy_all': 'نسخ لكل الأيام',
    'hours.copied': 'تم النسخ لكل الأيام',
    'hours.next_day': 'اليوم التالي',
    'hours.to': 'إلى',
    'hours.saved': 'تم حفظ أوقات العمل',

    'settings.title': 'الإعدادات',
    'settings.contact': 'بيانات التواصل',
    'settings.phone': 'رقم التواصل',
    'settings.address': 'العنوان',
    'settings.about': 'نبذة عن الصالون',
    'settings.about_en': 'نبذة بالإنجليزية',
    'settings.account': 'الحساب',
    'settings.signed_in': 'مسجّل الدخول برقم',
    'settings.password_current': 'كلمة المرور الحالية',
    'settings.password_next': 'كلمة المرور الجديدة',
    'settings.password_change': 'تغيير كلمة المرور',
    'settings.password_changed': 'تم تغيير كلمة المرور',
    'settings.language': 'اللغة',

    'preview.title': 'معاينة تطبيقك',
    'preview.live': 'معاينة مباشرة',
    'preview.app': 'التطبيق',
    'preview.icon': 'الأيقونة',
    'preview.open': 'افتح تطبيقك',
    'preview.book': 'احجز موعدك',
    'preview.services': 'الخدمات',
    'preview.team': 'فريقنا',
    'preview.open_now': 'مفتوح الآن',
    'preview.closed': 'مغلق الآن',
    'preview.empty': 'ستظهر خدماتك هنا',

    'admin.title': 'الصالونات',
    'admin.sub': 'كل صالون يحصل على تطبيقه الخاص على رابطه.',
    'admin.new': 'صالون جديد',
    'admin.empty': 'لا توجد صالونات بعد. أنشئ أول صالون.',
    'admin.total': 'صالون',
    'admin.active': 'فعّال',
    'admin.suspended': 'موقوف',
    'admin.subdomain': 'رابط الصالون',
    'admin.subdomain_hint': 'حروف إنجليزية صغيرة وأرقام، مثل elite',
    'admin.name_ar': 'اسم الصالون',
    'admin.name_en': 'الاسم بالإنجليزية',
    'admin.owner_name': 'اسم المالك',
    'admin.owner_phone': 'جوال المالك',
    'admin.owner_password': 'كلمة مرور مؤقتة',
    'admin.owner_password_hint': 'يغيّرها المالك لاحقًا. تُتجاهل إن كان للرقم حساب.',
    'admin.create': 'إنشاء الصالون',
    'admin.created': 'تم إنشاء الصالون',
    'admin.owner': 'المالك',

    'pub.services': 'الخدمات',
    'pub.team': 'فريقنا',
    'pub.hours': 'أوقات العمل',
    'pub.contact': 'التواصل',
    'pub.closed': 'مغلق',
    'pub.open_now': 'مفتوح الآن · حتى {time}',
    'pub.closed_now': 'مغلق الآن',
    'pub.from': 'يبدأ من',
    'pub.book': 'الحجز الإلكتروني قريبًا',
    'pub.manage': 'إدارة الصالون',
    'pub.owner_login': 'دخول صاحب الصالون',
    'pub.empty': 'الصالون يجهّز صفحته. عُد قريبًا.',

    'unit.min': '{n} دقيقة',
    'unit.min_short': '{n} د',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  },
  en: {
    'app.lang': 'العربية',
    save: 'Save',
    saved: 'Saved',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    add: 'Add',
    edit: 'Edit',
    done: 'Done',
    optional: 'optional',
    logout: 'Log out',
    retry: 'Try again',
    copy: 'Copy',
    copied: 'Link copied',
    share: 'Share',
    discard: 'Discard',
    unsaved: 'You have unsaved changes',
    'confirm.title': 'Delete for good?',
    'confirm.delete': 'This cannot be undone.',
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

    'login.welcome': 'Welcome back',
    'login.studio': 'Sign in to the {name} studio',
    'login.platform': 'Platform admin',
    'login.phone': 'Phone number',
    'login.password': 'Password',
    'login.show': 'Show password',
    'login.submit': 'Sign in',
    'login.back': 'Salon page',

    'nav.home': 'Home',
    'nav.brand': 'Brand',
    'nav.services': 'Services',
    'nav.team': 'Team',
    'nav.hours': 'Hours',
    'nav.settings': 'Settings',
    'nav.preview': 'Preview',

    'home.morning': 'Good morning',
    'home.evening': 'Good evening',
    'home.progress': 'App readiness',
    'home.left': { one: 'One step left to launch your salon app.', other: '{n} steps left to launch your salon app.' },
    'home.continue': 'Continue setup',
    'home.ready': 'Your app is ready',
    'home.ready_sub': 'Your salon is ready for customers. Share the link with them.',
    'home.steps': 'Setup steps',
    'step.brand': 'Brand and logo',
    'step.brand_sub': 'Your logo and colours in your app',
    'step.services': 'Services and prices',
    'step.services_sub': 'What you offer and for how much',
    'step.team': 'Your team',
    'step.team_sub': 'Barbers and stylists',
    'step.photos': 'Team photos',
    'step.photos_sub': 'A studio-touched photo for everyone',
    'home.glance': 'At a glance',
    'home.services': { one: 'service', other: 'services' },
    'home.members': { one: 'team member', other: 'team members' },
    'home.open_now': 'Open now',
    'home.closed_now': 'Closed now',
    'home.until': 'until {time}',
    'home.link': 'Your app link',
    'home.link_sub': 'Share it with customers or put it in your Instagram bio.',
    'home.share_text': 'Book your visit at {name}',

    'brand.title': 'Your salon brand',
    'brand.sub': 'Everything you change here shows up in your app right away.',
    'brand.slide_app': 'Your app',
    'brand.slide_home': "On your customer's phone",
    'brand.name': 'Salon name (Arabic)',
    'brand.name_en': 'Name in English',
    'brand.logo': 'Logo',
    'brand.logo_hint': 'PNG or JPG, ideally on a transparent or light background.',
    'brand.logo_upload': 'Upload logo',
    'brand.logo_change': 'Change',
    'brand.logo_remove': 'Remove',
    'brand.colors': 'Colours',
    'brand.colors_sub': 'Pick a ready palette or your own two colours.',
    'brand.primary': 'Main colour',
    'brand.primary_sub': 'Your app background and icon',
    'brand.accent': 'Accent colour',
    'brand.accent_sub': 'Buttons and highlights',
    'brand.style': 'Studio touch',
    'brand.style_sub': 'We unify your team photos automatically: same crop around the face, same lighting, same colours.',
    'brand.saved': 'Brand saved',
    'style.natural': 'Natural',
    'style.warm': 'Warm',
    'style.mono': 'Black & white',
    'style.brand': 'Salon colour',
    'pal.violet': 'Midnight violet',
    'pal.ocean': 'Ocean blue',
    'pal.classic': 'Classic',
    'pal.gold': 'Royal gold',
    'pal.copper': 'Copper',
    'pal.emerald': 'Emerald',
    'pal.burgundy': 'Burgundy',
    'pal.coral': 'Coral',
    'pal.sage': 'Sage',
    'pal.rose': 'Rose',
    'pal.lavender': 'Lavender',
    'pal.white': 'Clean white',
    'pal.sand': 'Sand',

    'services.title': 'Services',
    'services.sub': 'Your menu and prices, as customers see them.',
    'services.quick': 'Start from a ready menu',
    'services.quick_sub': 'Pick your salon type and we suggest the most-booked services. Edit them as you like.',
    'services.manual': 'or add a service yourself',
    'services.more': 'Add from ready menus',
    'type.barber': 'Barbershop',
    'type.ladies': "Ladies' salon",
    'type.spa': 'Spa & care',
    'services.tpl_sub': 'Pick what you offer and set your price for each.',
    'services.tpl_add': { zero: 'Pick at least one service', one: 'Add 1 service', other: 'Add {n} services' },
    'services.tpl_price': 'Price',
    'services.added': 'Services added',
    'services.add': 'New service',
    'services.edit': 'Edit service',
    'services.name': 'Service name (Arabic)',
    'services.name_en': 'Name in English',
    'services.desc': 'Short description',
    'services.icon': 'Icon',
    'services.duration': 'Duration',
    'services.price': 'Price',
    'services.from': 'Price starts from',
    'services.from_sub': 'When the price depends on length or request',
    'services.bookable': 'Bookable',
    'services.bookable_sub': 'Pause it without deleting',
    'services.who': 'Who offers it?',
    'services.no_team': 'Add your team to choose who offers each service.',
    'services.hidden': 'Hidden',
    'services.reorder': 'Reorder',
    'services.custom': 'Other',

    'team.title': 'Team',
    'team.sub': 'The barbers and stylists in your salon, with unified photos.',
    'team.add': 'New member',
    'team.edit': 'Edit member',
    'team.photo_add': 'Add a photo',
    'team.photo_add_sub': 'A clear head-and-shoulders shot',
    'team.photo_change': 'Change photo',
    'team.photo_remove': 'Remove',
    'team.processing': 'Adding the studio touch…',
    'team.studio': 'Studio touch',
    'team.name': 'Name (Arabic)',
    'team.role': 'Title',
    'team.role_ph': 'e.g. Senior barber',
    'team.name_en': 'Name in English',
    'team.role_en': 'Title in English',
    'team.services': 'Services they offer',
    'team.no_services': 'Add services first on the Services page.',
    'team.hours': 'Working hours',
    'team.hours_salon': 'Salon hours',
    'team.hours_own': 'Own hours',
    'team.active': 'Takes bookings',
    'team.active_sub': 'Pause during holidays',
    'team.paused': 'Paused',
    'team.services_n': { zero: 'No services', one: '1 service', other: '{n} services' },

    'hours.title': 'Opening hours',
    'hours.sub': 'When is your salon open? A day can have more than one range.',
    'hours.presets': 'Quick presets',
    'preset.full': '10am – 10pm',
    'preset.split': 'Split shift',
    'preset.night': 'Until 2am',
    'preset.friday': 'Friday after prayer',
    'hours.closed': 'Closed',
    'hours.open': 'Open',
    'hours.add_range': 'Add range',
    'hours.copy_all': 'Copy to all days',
    'hours.copied': 'Copied to all days',
    'hours.next_day': 'next day',
    'hours.to': 'to',
    'hours.saved': 'Opening hours saved',

    'settings.title': 'Settings',
    'settings.contact': 'Contact details',
    'settings.phone': 'Contact number',
    'settings.address': 'Address',
    'settings.about': 'About the salon (Arabic)',
    'settings.about_en': 'About (English)',
    'settings.account': 'Account',
    'settings.signed_in': 'Signed in as',
    'settings.password_current': 'Current password',
    'settings.password_next': 'New password',
    'settings.password_change': 'Change password',
    'settings.password_changed': 'Password changed',
    'settings.language': 'Language',

    'preview.title': 'Preview your app',
    'preview.live': 'Live preview',
    'preview.app': 'App',
    'preview.icon': 'Icon',
    'preview.open': 'Open your app',
    'preview.book': 'Book a visit',
    'preview.services': 'Services',
    'preview.team': 'Our team',
    'preview.open_now': 'Open now',
    'preview.closed': 'Closed now',
    'preview.empty': 'Your services will show here',

    'admin.title': 'Salons',
    'admin.sub': 'Every salon gets its own app on its own link.',
    'admin.new': 'New salon',
    'admin.empty': 'No salons yet. Create the first one.',
    'admin.total': 'salons',
    'admin.active': 'Active',
    'admin.suspended': 'Suspended',
    'admin.subdomain': 'Salon link',
    'admin.subdomain_hint': 'Lowercase English letters and digits, e.g. elite',
    'admin.name_ar': 'Salon name (Arabic)',
    'admin.name_en': 'Name in English',
    'admin.owner_name': 'Owner name',
    'admin.owner_phone': 'Owner phone',
    'admin.owner_password': 'Temporary password',
    'admin.owner_password_hint': 'The owner changes it later. Ignored if the number already has an account.',
    'admin.create': 'Create salon',
    'admin.created': 'Salon created',
    'admin.owner': 'Owner',

    'pub.services': 'Services',
    'pub.team': 'Our team',
    'pub.hours': 'Opening hours',
    'pub.contact': 'Contact',
    'pub.closed': 'Closed',
    'pub.open_now': 'Open now · until {time}',
    'pub.closed_now': 'Closed now',
    'pub.from': 'from',
    'pub.book': 'Online booking coming soon',
    'pub.manage': 'Manage salon',
    'pub.owner_login': 'Salon owner login',
    'pub.empty': 'This salon is setting up its page. Check back soon.',

    'unit.min': '{n} min',
    'unit.min_short': '{n}m',
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

const plurals = {};

/** t('key', { n: 3 }) — plural tables pick their form from `n`. */
export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.ar[key] ?? key;
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    const n = Number(vars?.n ?? 0);
    plurals[lang] ??= new Intl.PluralRules(lang);
    s = (n === 0 && s.zero) || s[plurals[lang].select(n)] || s.other;
  }
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
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
  const opts = { minimumFractionDigits: Number.isInteger(n) ? 0 : decimals, maximumFractionDigits: decimals };
  // In English, Jordan writes "6 JD" rather than the ISO "JOD 6".
  if (lang === 'en' && currency === 'JOD') return `${new Intl.NumberFormat(LOCALE(), opts).format(n)} JD`;
  return new Intl.NumberFormat(LOCALE(), { style: 'currency', currency, ...opts }).format(n);
}

/** The currency's short symbol on its own, e.g. "د.أ." or "JD". */
export function currencySymbol(currency) {
  if (lang === 'en' && currency === 'JOD') return 'JD';
  const parts = new Intl.NumberFormat(LOCALE(), { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(LOCALE(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(
    Date.UTC(2000, 0, 1, h, m),
  );
}

/** "10ص" / "10pm": the short form used on the hours scale and presets. */
export function fmtHour(h) {
  return new Intl.DateTimeFormat(LOCALE(), { hour: 'numeric', hour12: true, timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h % 24));
}

export const fmtDuration = (min) => t('unit.min', { n: min });

/** Arabic-Indic digits and the Arabic decimal separator to what the API expects. */
export function westernDigits(s) {
  return String(s)
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[٫،]/g, '.');
}

const FIELD_LABELS = {
  name_ar: 'brand.name',
  phone: 'login.phone',
  password: 'login.password',
  subdomain: 'admin.subdomain',
  owner_phone: 'admin.owner_phone',
  owner_password: 'admin.owner_password',
  duration_min: 'services.duration',
  price: 'services.price',
  current: 'settings.password_current',
  next: 'settings.password_next',
};

export function errorText(err) {
  const code = err?.code ?? 'server_error';
  const field = err?.field ?? '';
  const day = /hours\.(\d)$/.exec(field);
  const base = field.split('.').pop();
  const key = STRINGS.ar[`err.${code}`] ? `err.${code}` : 'err.server_error';
  return t(key, {
    field: FIELD_LABELS[base] ? t(FIELD_LABELS[base]) : base,
    day: day ? dayName(Number(day[1])) : '',
  });
}

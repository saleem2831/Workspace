import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';

export type Locale='en'|'ar';
const labels:Record<Locale,Record<string,string>>={
 en:{
  Home:'Home',Today:'Today','Work Board':'Work Board',Calendar:'Calendar',Learning:'Learning',Advisory:'Advisory',Sales:'Sales',Products:'Products',Projects:'Projects',Finance:'Finance',Approvals:'Approvals',Reports:'Reports',Settings:'Settings','SaaS Center':'SaaS Center','Platform Console':'Platform Console',
  'All companies':'All companies','Logout':'Sign out','My profile':'My profile','Notifications':'Notifications','Search':'Search',
  'Welcome back':'Welcome back','Sign in to your Bitstek Workspace account':'Sign in to your Bitstek Workspace account',
  'Email address':'Email address','Password':'Password','Workspace code':'Workspace code',
  'Sign in':'Sign in','Authenticator code':'Authenticator code','Back to password':'Back to password','Language':'Language',
  'Platform operations':'Platform operations','Customer provisioning and subscription metadata. No unrestricted access to private business records.':'Customer provisioning and subscription metadata. No unrestricted access to private business records.',
  'Create a customer workspace':'Create a customer workspace','Customer name':'Customer name','Super Admin email':'Super Admin email','Subscription plan':'Subscription plan','Create tenant and invitation':'Create tenant and invitation','Tenant directory':'Tenant directory',
  'Infrastructure migrations':'Infrastructure migrations','Database or object-storage relocation requires an independent Platform Owner approval and offline verification.':'Database or object-storage relocation requires an independent Platform Owner approval and offline verification.',
  'Migration type':'Migration type','Database':'Database','Object storage':'Object storage','Source label':'Source label','Target label':'Target label','Reason for migration':'Reason for migration','Submit migration plan':'Submit migration plan',
  'Approve':'Approve','Planned':'Planned','Approved':'Approved','Verified':'Verified','Run in offline terminal':'Run in offline terminal',
  'SaaS administration':'SaaS administration','Import existing data':'Import existing data','Company and tenant export':'Company and tenant export',
  'Loading your workspace…':'Loading your workspace…','Select language':'Select language',
  'Platform administration':'Platform administration','Account setup':'Account setup','Finish platform access setup':'Finish platform access setup',
  'This account is signed in, but Platform Owner privileges are not active yet. Your display name alone does not grant platform permissions.':'This account is signed in, but Platform Owner privileges are not active yet. Your display name alone does not grant platform permissions.',
  'Authenticator MFA':'Authenticator MFA','Enabled':'Enabled','Not enabled':'Not enabled',
  'Open Settings → Security and complete authenticator MFA enrollment.':'Open Settings → Security and complete authenticator MFA enrollment.',
  'Go to Security settings':'Go to Security settings',
  'From an authorized backend administrator terminal, configure PLATFORM_OPERATOR_EMAIL to this account and PLATFORM_OPERATOR_LEVEL=owner, then run the platform promotion dry-run and apply commands.':'From an authorized backend administrator terminal, configure PLATFORM_OPERATOR_EMAIL to this account and PLATFORM_OPERATOR_LEVEL=owner, then run the platform promotion dry-run and apply commands.',
  'Sign out and sign in again. The Platform Console will then appear in the sidebar.':'Sign out and sign in again. The Platform Console will then appear in the sidebar.',
  'Your account has no business-company assignments. This is expected for a dedicated platform administrator.':'Your account has no business-company assignments. This is expected for a dedicated platform administrator.',
 },
 ar:{
  Home:'الرئيسية',Today:'اليوم','Work Board':'لوحة العمل',Calendar:'التقويم',Learning:'التعلّم',Advisory:'الاستشارات',Sales:'المبيعات',Products:'المنتجات',Projects:'المشاريع',Finance:'المالية',Approvals:'الموافقات',Reports:'التقارير',Settings:'الإعدادات','SaaS Center':'إدارة الاشتراك','Platform Console':'إدارة المنصة',
  'All companies':'جميع الشركات','Logout':'تسجيل الخروج','My profile':'ملفي الشخصي','Notifications':'الإشعارات','Search':'بحث',
  'Welcome back':'مرحباً بعودتك','Sign in to your Bitstek Workspace account':'سجّل الدخول إلى حساب مساحة عمل بيتستك',
  'Email address':'البريد الإلكتروني','Password':'كلمة المرور','Workspace code':'رمز مساحة العمل',
  'Sign in':'تسجيل الدخول','Authenticator code':'رمز المصادقة','Back to password':'العودة إلى كلمة المرور','Language':'اللغة',
  'Platform operations':'إدارة المنصة','Customer provisioning and subscription metadata. No unrestricted access to private business records.':'إدارة حسابات العملاء واشتراكاتهم، دون وصول غير مقيّد إلى بياناتهم الخاصة.',
  'Create a customer workspace':'إنشاء مساحة عمل للعميل','Customer name':'اسم العميل','Super Admin email':'البريد الإلكتروني للمشرف العام','Subscription plan':'خطة الاشتراك','Create tenant and invitation':'إنشاء الحساب والدعوة','Tenant directory':'دليل العملاء',
  'Infrastructure migrations':'ترحيل البنية التحتية','Database or object-storage relocation requires an independent Platform Owner approval and offline verification.':'يتطلب نقل قاعدة البيانات أو التخزين موافقة مستقلة من مالك المنصة والتحقق خارج التطبيق.',
  'Migration type':'نوع الترحيل','Database':'قاعدة البيانات','Object storage':'تخزين الملفات','Source label':'اسم المصدر','Target label':'اسم الوجهة','Reason for migration':'سبب الترحيل','Submit migration plan':'إرسال خطة الترحيل',
  'Approve':'موافقة','Planned':'مخطط','Approved':'موافق عليه','Verified':'تم التحقق','Run in offline terminal':'التنفيذ من سطر الأوامر الآمن',
  'SaaS administration':'إدارة الخدمة','Import existing data':'استيراد البيانات الحالية','Company and tenant export':'تصدير بيانات الشركة أو المؤسسة',
  'Loading your workspace…':'جار تحميل مساحة العمل…','Select language':'اختر اللغة',
  'Platform administration':'إدارة المنصة','Account setup':'إعداد الحساب','Finish platform access setup':'إكمال إعداد صلاحيات المنصة',
  'This account is signed in, but Platform Owner privileges are not active yet. Your display name alone does not grant platform permissions.':'تم تسجيل الدخول، لكن صلاحيات مالك المنصة لم تُفعّل بعد. اسم الحساب وحده لا يمنح صلاحيات المنصة.',
  'Authenticator MFA':'المصادقة متعددة العوامل','Enabled':'مفعّلة','Not enabled':'غير مفعّلة',
  'Open Settings → Security and complete authenticator MFA enrollment.':'افتح الإعدادات ← الأمان وأكمل إعداد تطبيق المصادقة.',
  'Go to Security settings':'الانتقال إلى إعدادات الأمان',
  'From an authorized backend administrator terminal, configure PLATFORM_OPERATOR_EMAIL to this account and PLATFORM_OPERATOR_LEVEL=owner, then run the platform promotion dry-run and apply commands.':'من طرفية مسؤول خلفية مخوّل، عيّن بريد هذا الحساب في PLATFORM_OPERATOR_EMAIL واجعل PLATFORM_OPERATOR_LEVEL=owner، ثم نفّذ أمر المعاينة وبعده أمر التفعيل.',
  'Sign out and sign in again. The Platform Console will then appear in the sidebar.':'سجّل الخروج ثم أعد تسجيل الدخول. ستظهر إدارة المنصة في الشريط الجانبي.',
  'Your account has no business-company assignments. This is expected for a dedicated platform administrator.':'لا يملك هذا الحساب شركات أعمال معيّنة، وهذا متوقع لحساب إدارة منصة مخصص.',
  'Sign in to Workspace':'تسجيل الدخول إلى مساحة العمل','Signing in…':'جار تسجيل الدخول…','Verify & sign in':'تحقق وسجّل الدخول',
  'Claim workspace invitation':'قبول دعوة مساحة العمل','Invitation token':'رمز الدعوة','Invited email':'البريد المدعو',
  'Create password / existing account password':'إنشاء كلمة المرور / كلمة المرور الحالية','Accept invitation':'قبول الدعوة','Back to login':'العودة لتسجيل الدخول',

  'New action':'إجراء جديد','Save changes':'حفظ التغييرات','Create record':'إنشاء سجل','Cancel':'إلغاء',
  'Saving…':'جار الحفظ…','Uploading…':'جار الرفع…','Select':'اختر','Search records':'البحث في السجلات','Search records...':'ابحث في السجلات...',
  'No records found':'لا توجد سجلات','Try changing your filters or creating a new record.':'جرّب تغيير المرشحات أو إنشاء سجل جديد.',
  'Title':'العنوان','Description':'الوصف','Status':'الحالة','Active':'نشط','Pending':'قيد الانتظار','Approved':'تمت الموافقة','Rejected':'مرفوض','Completed':'مكتمل','Archived':'مؤرشف',
  'Company':'الشركة','Company (required)':'الشركة (مطلوب)','Client Id':'العميل','Project Id':'المشروع','Owner Id':'المسؤول','Assignee Ids':'المكلّفون','Reviewer Ids':'المراجعون',
  'Amount':'المبلغ','Currency':'العملة','Email':'البريد الإلكتروني','Phone':'الهاتف','Country Code':'رمز الدولة','Student Name':'اسم الطالب','Full name':'الاسم الكامل',
  'Courses':'الدورات','Students':'الطلاب','Batches':'الدفعات','Fee Installments':'أقساط الرسوم','Internships':'التدريب العملي','Mentors':'المشرفون',
  'Invoice':'الفاتورة','Invoices':'الفواتير','Expenses':'المصروفات','Transfers':'التحويلات','Approver':'الموافق','Reference':'المرجع',
  'New':'جديد','Draft':'مسودة','Overdue':'متأخر','Due today':'مستحق اليوم','Follow-ups':'المتابعات',
  'Daily command centre':'مركز العمليات اليومي','Your operations at a glance':'نظرة عامة على العمليات',
  'Student & course operations':'إدارة الطلاب والدورات','Capital & trading oversight':'إدارة رأس المال والتداول','Sales pipeline':'مسار المبيعات',
  'Project delivery':'تنفيذ المشاريع','Approval inbox':'صندوق الموافقات','Workspace settings':'إعدادات مساحة العمل',
  'Loading records':'جار تحميل السجلات','Edit record':'تعديل السجل','Add member':'إضافة عضو',
  'Subscription':'الاشتراك','Client':'العميل','Product':'المنتج','Price':'السعر','Start At':'تاريخ البداية','End At':'تاريخ النهاية',

 }
};
type LocaleContext={locale:Locale;setLocale:(lang:Locale)=>void;t:(key:string)=>string;formatNumber:(value:number)=>string;formatDate:(value:Date)=>string};
const Context=createContext<LocaleContext|undefined>(undefined);
export function LocaleProvider({children}:{children:ReactNode}){
 const [locale,setLocaleState]=useState<Locale>(()=>localStorage.getItem('bw_language')==='ar'?'ar':'en');
 const setLocale=(lang:Locale)=>{localStorage.setItem('bw_language_override','yes');setLocaleState(lang);};
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';localStorage.setItem('bw_language',locale);},[locale]);
 const value=useMemo<LocaleContext>(()=>({locale,setLocale,t:(key:string)=>labels[locale][key]||key,
    formatNumber:(v:number)=>new Intl.NumberFormat(locale==='ar'?'ar-AE':'en-IN').format(v),
    formatDate:(v:Date)=>new Intl.DateTimeFormat(locale==='ar'?'ar-AE':'en-IN',{dateStyle:'medium'}).format(v)}),[locale]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLocale(){const c=useContext(Context);if(!c)throw new Error('LocaleProvider missing');return c;}
export function LocalePicker(){const {locale,setLocale,t}=useLocale();return <label className="language-switch" aria-label={t('Language')}>
 <span className="sr-only">{t('Language')}</span><select value={locale} onChange={e=>setLocale(e.target.value as Locale)} aria-label={t('Select language')}>
 <option value="en">English</option><option value="ar">العربية</option></select></label>;}

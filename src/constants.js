// ---------- app-wide constants ----------

export const DEFAULT_LABELS = {
  appTitle: "Pharmacy RASD",
  appSubtitle:
    "صيدلية العيادة المتنقلة — متابعة الأدوية والدفعات وتواريخ الانتهاء",
  tabMeds: "الأدوية",
  tabFirstAid: "الإسعافات الأولية",
  tabLog: "سجلّ الصرف",
  tabDailyLog: "سجل الصرف اليومي",
  tabToday: "اليوم",
  kpiExpired: "منتهية الصلاحية",
  kpiCritical: "أقل من شهر",
  kpiLowFirstAid: "مواد إسعاف قاربت على الانتهاء",
  kpiMedCount: "نوع دواء مسجّل",
  kpiLowStock: "قاربت الكمية على الانتهاء",
  sidebarAll: "كل الأدوية",
  addCategoryBtn: "فئة جديدة",
  addMedBtn: "إضافة دواء",
  searchPlaceholder: "ابحث عن دواء…",
  sessionLabel: "تاريخ اليوم اللي بتسجّل فيه الصرف:",
  sessionHint: "حدده مرة وكل ضغطة سحب تحته بتستخدم نفس التاريخ",
  addBatchBtn: "دفعة جديدة",
  withdrawCustomBtn: "صرف مخصّص",
  remainingUnitLabel: "وحدة متبقية",
  firstAidIntro: "مواد الإسعافات الأولية المتوفرة في العيادة",
  addFirstAidBtn: "إضافة مادة",
  logTitle: "سجلّ عمليات الصرف من الرفوف (كل الأدوية)",
  emptyMedsTitle: "لا يوجد أدوية مسجّلة بعد",
  emptyMedsSubtitle: "ابدأ بإضافة أول دواء لهذه الفئة أو للصيدلية عمومًا.",
};

export const LABEL_META = [
  ["appTitle", "اسم التطبيق"],
  ["appSubtitle", "الوصف تحت الاسم"],
  ["tabMeds", "تبويب: الأدوية"],
  ["tabFirstAid", "تبويب: الإسعافات الأولية"],
  ["tabLog", "تبويب: سجلّ الصرف"],
  ["tabDailyLog", "تبويب: سجل الصرف اليومي"],
  ["tabToday", "تبويب: اليوم"],
  ["kpiExpired", "مؤشر: منتهية الصلاحية"],
  ["kpiCritical", "مؤشر: أقل من شهر"],
  ["kpiLowFirstAid", "مؤشر: مواد إسعاف قاربت على الانتهاء"],
  ["kpiMedCount", "مؤشر: عدد الأدوية"],
  ["kpiLowStock", "مؤشر: قاربت الكمية على الانتهاء"],
  ["sidebarAll", "زر: كل الأدوية"],
  ["addCategoryBtn", "زر: فئة جديدة"],
  ["addMedBtn", "زر: إضافة دواء"],
  ["searchPlaceholder", "نص البحث"],
  ["sessionLabel", "عنوان شريط التاريخ"],
  ["sessionHint", "تلميح شريط التاريخ"],
  ["addBatchBtn", "زر: دفعة جديدة"],
  ["withdrawCustomBtn", "زر: صرف مخصّص"],
  ["remainingUnitLabel", "نص: وحدة متبقية"],
  ["firstAidIntro", "مقدمة قسم الإسعافات"],
  ["addFirstAidBtn", "زر: إضافة مادة إسعاف"],
  ["logTitle", "عنوان قسم السجلّ"],
  ["emptyMedsTitle", "عنوان حالة الفراغ"],
  ["emptyMedsSubtitle", "وصف حالة الفراغ"],
];

export const URGENCY_STYLE = {
  expired: { bg: "#FBE7E4", fg: "#9A2E23", bar: "#C4453B" },
  critical: { bg: "#FBEEDD", fg: "#8A5417", bar: "#D98A3D" },
  warning: { bg: "#FFF7DE", fg: "#7A6416", bar: "#E0B23D" },
  ok: { bg: "#E7F3F1", fg: "#145C5C", bar: "#2E8B8B" },
  // Distinct secondary tone (calm blue) — used where a warning-adjacent KPI
  // needs to read as clearly different from the amber "warning" tone above
  // (e.g. first-aid stock vs. low-medication-stock on the dashboard), while
  // still fitting the app's existing cool teal/blue-leaning palette.
  info: { bg: "#E8F1FB", fg: "#1B5FA8", bar: "#3B82C4" },
};

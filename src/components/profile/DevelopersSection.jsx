import { Briefcase, GraduationCap } from "lucide-react";
import { styles } from "../../styles/styles";

// Static, informational only — never persisted as user/account data. Edit
// this list directly to update credits; nothing here reads from Supabase.
const DEVELOPERS = [
  {
    name: "علي دقة",
    title: "ممرض قانوني وموظف في جمعية الإغاثة الطبية",
    education: "حاصل على دبلوم متوسط في صيانة الحاسوب والشبكات",
  },
  {
    name: "عثمان العبيات",
    title: "مهندس ومطور برامج",
    education: "حاصل على درجة البكالوريوس في هندسة النظم الذكية بدرجة الشرف الأولى",
  },
];

function initials(name) {
  return name.trim().slice(0, 1);
}

export function DevelopersSection() {
  return (
    <div style={styles.devGrid}>
      {DEVELOPERS.map((dev) => (
        <div key={dev.name} style={styles.devCard}>
          <div style={styles.devCardHead}>
            <span style={styles.devAvatar}>{initials(dev.name)}</span>
            <span style={styles.devName}>{dev.name}</span>
          </div>
          <div style={styles.devDetailRow}>
            <Briefcase size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{dev.title}</span>
          </div>
          <div style={styles.devDetailRow}>
            <GraduationCap size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{dev.education}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

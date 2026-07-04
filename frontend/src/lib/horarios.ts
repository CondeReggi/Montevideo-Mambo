// Datos y helpers compartidos de la grilla de horarios.

export const WD = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface SchedClass {
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string;
  name: string;
  style: string;
  level: string;
}

/** Grilla de marca 2026 (respaldo si el backend no responde). Fuente: /Referencias. */
export const FALLBACK_SCHEDULE: SchedClass[] = [
  // Lunes
  { weekday: 1, startTime: "18:30", endTime: "19:30", name: "Ritmos para niñ@s", style: "Ritmos", level: "Niños" },
  { weekday: 1, startTime: "19:30", endTime: "20:30", name: "Curso Salsa Principiantes", style: "Salsa", level: "Principiantes" },
  { weekday: 1, startTime: "20:30", endTime: "21:30", name: "Salsa Princ.-Avanzados", style: "Salsa", level: "Princ.-Avanzados" },
  { weekday: 1, startTime: "21:30", endTime: "22:30", name: "Cubafusión", style: "Cubafusión", level: "Todos" },
  // Martes
  { weekday: 2, startTime: "18:30", endTime: "19:30", name: "Estilo Femenino Salsa", style: "Salsa", level: "Estilo femenino" },
  { weekday: 2, startTime: "19:30", endTime: "20:30", name: "Bachata Princ.-Avanzados", style: "Bachata", level: "Princ.-Avanzados" },
  { weekday: 2, startTime: "20:30", endTime: "21:30", name: "Salsa Intermedio", style: "Salsa", level: "Intermedio" },
  { weekday: 2, startTime: "21:30", endTime: "22:30", name: "Ensayos Coreográficos", style: "Coreografía", level: "Grupo" },
  // Miércoles
  { weekday: 3, startTime: "18:30", endTime: "19:30", name: "Ritmos para niñ@s", style: "Ritmos", level: "Niños" },
  { weekday: 3, startTime: "19:30", endTime: "20:30", name: "Curso Salsa Principiantes", style: "Salsa", level: "Principiantes" },
  { weekday: 3, startTime: "20:30", endTime: "21:30", name: "Salsa Princ.-Avanzados", style: "Salsa", level: "Princ.-Avanzados" },
  { weekday: 3, startTime: "21:30", endTime: "22:30", name: "Cubafusión", style: "Cubafusión", level: "Todos" },
  // Jueves
  { weekday: 4, startTime: "18:30", endTime: "19:30", name: "Bachata Principiantes", style: "Bachata", level: "Principiantes" },
  { weekday: 4, startTime: "19:30", endTime: "20:30", name: "Bachata Princ.-Avanzados", style: "Bachata", level: "Princ.-Avanzados" },
  { weekday: 4, startTime: "20:30", endTime: "21:30", name: "Salsa Intermedio", style: "Salsa", level: "Intermedio" },
  { weekday: 4, startTime: "21:30", endTime: "22:30", name: "Taller Mensual", style: "Taller", level: "Todos" },
  // Viernes
  { weekday: 5, startTime: "18:30", endTime: "19:30", name: "Estilo Femenino Bachata", style: "Bachata", level: "Estilo femenino" },
  { weekday: 5, startTime: "19:30", endTime: "20:30", name: "Rueda de Casino", style: "Salsa", level: "Rueda" },
  { weekday: 5, startTime: "20:30", endTime: "21:30", name: "Mambo Shines / Parejas", style: "Mambo", level: "Todos" },
  { weekday: 5, startTime: "21:30", endTime: "22:30", name: "Ensayos Coreográficos", style: "Coreografía", level: "Grupo" },
  // Sábado
  { weekday: 6, startTime: "14:00", endTime: "15:00", name: "Bachata Principiantes", style: "Bachata", level: "Principiantes" },
  { weekday: 6, startTime: "15:00", endTime: "16:00", name: "Salsa Principiantes", style: "Salsa", level: "Principiantes" },
  { weekday: 6, startTime: "16:00", endTime: "17:00", name: "Salsa Princ.-Avanzados", style: "Salsa", level: "Princ.-Avanzados" },
];

/** Descripción corta y amigable de una clase (según su nombre/estilo). */
export function classDescription(name: string, style?: string): string {
  const n = `${name} ${style ?? ""}`.toLowerCase();
  if (n.includes("niñ") || n.includes("ritmos")) return "Ritmos y juegos para los más chicos: coordinación, expresión y mucha diversión bailando.";
  if (n.includes("rueda") || n.includes("casino")) return "Rueda de casino: salsa cubana en grupo, con cambios de pareja y figuras que se “cantan” en el momento.";
  if (n.includes("estilo femenino")) return "Estilo femenino: musicalidad, actitud, giros y trabajo de movimiento y presencia.";
  if (n.includes("ensayo") || n.includes("coreogr")) return "Ensayo del grupo coreográfico: montaje y puesta a punto de las coreografías para muestras y eventos.";
  if (n.includes("shines") || n.includes("mambo")) return "Mambo y shines: pasos en solitario y en pareja, con la musicalidad y energía del mambo.";
  if (n.includes("cubafus")) return "Cubafusión: fusión de ritmos cubanos (rumba, son, afro) y movimiento libre.";
  if (n.includes("taller")) return "Taller mensual: una temática especial del mes para profundizar técnica y repertorio.";
  if (n.includes("bachata")) return "Bachata: técnica de pareja, musicalidad y estilo sensual/dominicano.";
  if (n.includes("salsa")) return "Salsa: pasos, giros, vueltas y musicalidad, en pareja y en línea.";
  return "Clase de baile con foco en técnica, musicalidad y disfrute.";
}

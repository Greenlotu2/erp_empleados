// Tipos de integrante con convenio (no son personal de nómina). Se separan dos
// reglas que antes eran una sola:
//  - esConvenio: Prácticas, Servicio Social y Jóvenes Construyendo el Futuro.
//    Van en la pestaña "Convenios", su contrato es del tipo del convenio y no
//    entran a la raya semanal.
//  - llevaHoras: solo Prácticas y Servicio Social (contador de la extensión y
//    meta de horas). JCF no lleva horas.

export const ROL_JCF = "Jóvenes Construyendo el Futuro";
export const ROLES_CON_HORAS = ["Practicante", "Servicio Social"];
export const ROLES_CONVENIO = [...ROLES_CON_HORAS, ROL_JCF];

// Escuelas con convenio para Prácticas y Servicio Social (se pueden agregar
// más al vuelo desde el formulario, igual que las áreas).
export const ESCUELAS_BASE = ["BUAP", "COBAT", "ITP"];

export const esConvenio = (rol?: string | null) => ROLES_CONVENIO.includes(rol || "");
export const llevaHoras = (rol?: string | null) => ROLES_CON_HORAS.includes(rol || "");

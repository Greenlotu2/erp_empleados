// Arquitectos que van y vienen de la obra: "en obra" es un estado del DÍA, no un
// puesto. Se guarda la fecha en que se marcó (empleados.en_obra_fecha) y solo
// cuenta si es hoy, así al día siguiente vuelve solo a "en oficina".

// Se detecta por la especialidad ("Arquitecto", "Arquitecta", "Arquitecta/Ventas"…).
export const esArquitecto = (especialidad?: string | null) =>
  /arquitect/i.test(especialidad || "");

// "YYYY-MM-DD" de hoy en hora de México.
export const hoyMx = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export const estaEnObra = (fecha?: string | null) =>
  !!fecha && String(fecha).slice(0, 10) === hoyMx();

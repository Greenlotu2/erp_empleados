import { supabase } from "./supabaseClient";
import { ROLES_CONVENIO } from "./convenios";

// La raya de los trabajadores es semanal (se paga cada sábado): cada semana se
// abre sola la lista de la semana en curso y la anterior, con un renglón por
// cada persona de planta (todos menos Gerencia y convenio). El pago por día se
// copia de su última semana con pago, y los días quedan en ceros hasta que se
// capturen. Si la lista ya existe no se toca nada.

const d2 = (n: number) => String(n).padStart(2, "0");
const ymd = (dt: Date) =>
  `${dt.getFullYear()}-${d2(dt.getMonth() + 1)}-${d2(dt.getDate())}`;

function sumaDias(fecha: string, dias: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + dias));
}

// Lunes de la semana de `fecha` ("YYYY-MM-DD"), sin zona horaria.
function lunesDe(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + (dt.getDay() === 0 ? -6 : 1 - dt.getDay()));
  return ymd(dt);
}

let ultimaCorrida = 0;

// Devuelve true si creó algo (para que quien llama vuelva a leer los datos).
export async function asegurarSemanasRaya(forzar = false): Promise<boolean> {
  // Se llama desde varias pantallas: no más de una vez cada 5 minutos.
  if (!forzar && Date.now() - ultimaCorrida < 5 * 60 * 1000) return false;
  ultimaCorrida = Date.now();

  try {
    const lunes = lunesDe(ymd(new Date()));
    const iniciosDeseados = [sumaDias(lunes, -7), lunes];

    const [{ data: emps }, { data: semanas }, { data: detalle }] =
      await Promise.all([
        supabase.from("empleados").select("id, rol, nivel"),
        supabase.from("raya_semanas").select("id, semana_inicio"),
        supabase
          .from("raya_detalle")
          .select("semana_id, empleado_id, pago_dia")
          .gt("pago_dia", 0),
      ]);
    if (!emps || !semanas) return false;

    const planta = emps.filter(
      (e: any) =>
        !ROLES_CONVENIO.includes(e.rol || "") && e.nivel !== "Gerencia",
    );
    if (planta.length === 0) return false;

    // Último pago por día de cada persona (de su semana más reciente con pago).
    const inicioDe = new Map<string, string>(
      semanas.map((s: any) => [s.id, String(s.semana_inicio).slice(0, 10)]),
    );
    const ultimoPago = new Map<string, { inicio: string; pago: number }>();
    (detalle || []).forEach((d: any) => {
      const inicio = inicioDe.get(d.semana_id) || "";
      const previo = ultimoPago.get(d.empleado_id);
      if (!previo || inicio > previo.inicio) {
        ultimoPago.set(d.empleado_id, { inicio, pago: Number(d.pago_dia) });
      }
    });

    let creoAlgo = false;

    // 1. Semanas que faltan (la actual y la anterior; la anterior solo si el
    //    sistema ya tenía alguna lista, para no inventar historia).
    const yaExisten = new Set(
      semanas.map((s: any) => String(s.semana_inicio).slice(0, 10)),
    );
    const primera = semanas
      .map((s: any) => String(s.semana_inicio).slice(0, 10))
      .sort()[0];
    const crear = iniciosDeseados.filter(
      (i) => !yaExisten.has(i) && (i === lunes || (primera && i >= primera)),
    );
    if (crear.length > 0) {
      await supabase.from("raya_semanas").upsert(
        crear.map((semana_inicio) => ({ semana_inicio, estado: "Borrador" })),
        { onConflict: "semana_inicio", ignoreDuplicates: true },
      );
      creoAlgo = true;
    }

    // 2. Renglones: cada persona de planta en las dos semanas, con su último pago.
    const { data: semanasActuales } = await supabase
      .from("raya_semanas")
      .select("id, semana_inicio")
      .in("semana_inicio", iniciosDeseados);
    const ids = (semanasActuales || []).map((s: any) => s.id);
    if (ids.length === 0) return creoAlgo;

    const { data: existentes } = await supabase
      .from("raya_detalle")
      .select("semana_id, empleado_id")
      .in("semana_id", ids);
    const tiene = new Set(
      (existentes || []).map((d: any) => `${d.semana_id}|${d.empleado_id}`),
    );
    const faltan = ids.flatMap((semana_id: string) =>
      planta
        .filter((e: any) => !tiene.has(`${semana_id}|${e.id}`))
        .map((e: any) => ({
          semana_id,
          empleado_id: e.id,
          dias_trabajados: 0,
          pago_dia: ultimoPago.get(e.id)?.pago || 0,
          extras: 0,
          descuentos: 0,
        })),
    );
    if (faltan.length > 0) {
      await supabase.from("raya_detalle").upsert(faltan, {
        onConflict: "semana_id,empleado_id",
        ignoreDuplicates: true,
      });
      creoAlgo = true;
    }
    return creoAlgo;
  } catch (err) {
    console.error("No se pudieron abrir las listas de raya:", err);
    return false;
  }
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import Sidebar from "../../../components/Sidebar";
import { Icon } from "../../../components/icons";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentAdminId } from "../../../lib/currentAdmin";

// Menú desplegable de filtro por columna (estilo autofiltro de Excel).
function FiltroColumna({
  value,
  onChange,
  opciones,
  etiqueta,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  etiqueta: string;
}) {
  return (
    <div className="relative mb-1.5">
      <Icon
        name="list"
        size={13}
        className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${value ? "text-blue-600" : "text-slate-400"}`}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-white border-2 rounded-lg pl-7 pr-6 py-1.5 text-[12px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-colors cursor-pointer ${
          value
            ? "border-blue-400 text-slate-800 font-medium"
            : "border-slate-200 text-slate-500"
        }`}
      >
        <option value="">{etiqueta}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={13}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
    </div>
  );
}

// Áreas "base" sugeridas (mismas 4 del organigrama). No todas las líneas de negocio
// comparten las mismas áreas — cada proyecto puede tener además áreas propias,
// agregadas a mano con el botón "+" y guardadas libremente en `proyecto_areas.area`
// (columna TEXT sin restricción a esta lista).
const AREAS = [
  "Administrativo y RRHH",
  "Proyectos y Obra",
  "TICs",
  "Financiero-Contable",
] as const;
type Area = string;

interface Empleado {
  id: string;
  nombre: string;
  nivel?: string | null;
  area?: string | null;
  color?: string | null;
  horas_acumuladas?: number | null;
}

interface Proyecto {
  id: string;
  nombre: string;
  logo_url?: string | null;
}

interface ArchivoReal {
  id: string;
  proyecto_id: string;
  nombre: string;
  storage_path: string;
  url: string;
  subido_por?: string | null;
  area?: string | null;
  subarea?: string | null;
  created_at: string;
}

// Bucket real de Supabase Storage (mismo que ya usa el resto de la app para
// documentos de empleados) — los archivos de cada línea de negocio viven en
// `proyectos/{proyecto_id}/` dentro de él. Metadatos en `proyecto_archivos`.
const ARCHIVOS_BUCKET = "documentacion";

// Límite de Storage del plan Free de Supabase (1 GB). No hay API para leerlo, es
// una constante — súbela si el proyecto pasa a un plan de pago.
const STORAGE_LIMIT_BYTES = 1024 ** 3;

const formatBytes = (n: number) => {
  if (!n || n < 1) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / 1024 ** i;
  return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${u[i]}`;
};

const tipoDeArchivo = (nombre: string): "pdf" | "word" | "excel" | "otros" => {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "xls" || ext === "xlsx") return "excel";
  return "otros";
};

// Placeholder de "logo" por proyecto (iniciales + color determinístico) — se usa
// cuando `proyectos.logo_url` está vacío (ej. un proyecto recién creado).
const LOGO_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];
const getProyectoLogoColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
};
const getProyectoIniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Colores por avatar de persona (mismo patrón que el logo de proyecto).
const AVATAR_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];
const getAvatarColor = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length];

// Sanitiza el nombre de archivo para usarlo en la ruta de Storage — Supabase
// Storage rechaza o corrompe rutas con acentos/espacios/símbolos raros. El
// nombre original (con acentos y todo) se conserva tal cual en `nombre`, esta
// versión solo se usa para el `storage_path`.
const sanitizeFileName = (nombre: string) => {
  const normalizado = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return normalizado.replace(/[^a-zA-Z0-9._-]/g, "_");
};

const getFileStyle = (nombre: string) => {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { color: "#dc2626", bgTint: "#fef2f2" };
  if (ext === "docx" || ext === "doc")
    return { color: "#2563eb", bgTint: "#eff6ff" };
  if (ext === "xlsx" || ext === "xls")
    return { color: "#059669", bgTint: "#ecfdf5" };
  return { color: "#64748b", bgTint: "#f8fafc" };
};

export default function EquiposPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeProyectoId, setActiveProyectoId] = useState<string>("");

  // Reales — persistidos en Supabase (proyecto_areas / proyecto_empleados).
  const [areasPorProyecto, setAreasPorProyecto] = useState<
    Record<string, Area[]>
  >({});
  const [personasPorProyecto, setPersonasPorProyecto] = useState<
    Record<string, string[]>
  >({}); // empleado_id[]
  const [personaAAgregar, setPersonaAAgregar] = useState(""); // empleado_id

  // Área seleccionada como filtro (distinto de "asignada al proyecto"): al hacer
  // clic en una de las áreas de la línea activa, se filtra la lista de personas
  // sugeridas para agregar a esa misma área organizacional (`empleados.area`).
  const [areaFiltro, setAreaFiltro] = useState<string | null>(null);

  // Tamaño (bytes) por `storage_path`, obtenido con un barrido de Storage al cargar.
  const [tamanosPorPath, setTamanosPorPath] = useState<Record<string, number>>(
    {},
  );
  const [calculandoEspacio, setCalculandoEspacio] = useState(false);

  // Panel de control: búsqueda global de archivos + modal "Ver todos".

  const [verTodosOpen, setVerTodosOpen] = useState(false);
  const [ordenTodos, setOrdenTodos] = useState<"fecha" | "peso" | "nombre">(
    "fecha",
  );

  // Cajas de búsqueda por columna (filtran lo que se lista en cada una).
  const [buscarProyecto, setBuscarProyecto] = useState("");
  const [buscarArea, setBuscarArea] = useState("");
  const [buscarSubarea, setBuscarSubarea] = useState("");
  const [buscarColaborador, setBuscarColaborador] = useState("");

  // Sub-áreas por (proyecto|área), guardadas en `proyecto_subareas`. `subareaFiltro`
  // es la elegida en la columna "Sub (area)" — depende de que haya un área elegida.
  const [subareasPorProyectoArea, setSubareasPorProyectoArea] = useState<
    Record<string, string[]>
  >({});
  const [subareaFiltro, setSubareaFiltro] = useState<string | null>(null);
  const [isAddSubareaOpen, setIsAddSubareaOpen] = useState(false);
  const [nuevaSubareaNombre, setNuevaSubareaNombre] = useState("");
  const [creandoSubarea, setCreandoSubarea] = useState(false);

  // Trabajador seleccionado (empleado_id): al hacer clic en uno de los ya
  // asignados, filtra la columna Archivo para mostrar solo lo que esa persona subió.
  const [trabajadorFiltro, setTrabajadorFiltro] = useState<string | null>(null);

  // Reales — persistidos en Storage (bucket `documentacion`) + tabla `proyecto_archivos`.
  const [archivosPorProyecto, setArchivosPorProyecto] = useState<
    Record<string, ArchivoReal[]>
  >({});
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Id del archivo recién subido — se destaca con un destello breve y luego se limpia.
  const [archivoRecienSubidoId, setArchivoRecienSubidoId] = useState<
    string | null
  >(null);

  // Identidad de quien tiene sesión iniciada — determina permisos por nivel:
  // Gerencia/Coordinador ven y gestionan todas las líneas de negocio; Trabajador
  // solo ve/sube archivos en las líneas donde está asignado (proyecto_empleados).
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    getCurrentAdminId().then(setCurrentEmpleadoId);
  }, []);

  // Alta de nueva línea de negocio — esto sí es real: inserta en `proyectos`, la misma
  // tabla que usa el resto de la app (tareas, calendario, etc.), no es parte del mockup.
  const [isAddProyectoOpen, setIsAddProyectoOpen] = useState(false);
  const [nuevoProyectoNombre, setNuevoProyectoNombre] = useState("");
  const [creandoProyecto, setCreandoProyecto] = useState(false);

  // Alta de área personalizada para la línea de negocio activa — también real,
  // inserta en `proyecto_areas` (misma tabla/mecanismo que el toggle de áreas base).
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState("");
  const [creandoArea, setCreandoArea] = useState(false);

  // Confirmación real (modal, no window.confirm) antes de borrar un archivo o
  // quitar a alguien del proyecto — ambas son acciones que no se pueden deshacer.
  const [confirmDialog, setConfirmDialog] = useState<{
    titulo: string;
    mensaje: string;
    onConfirmar: () => void;
  } | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [
        { data: empData },
        { data: proyData },
        { data: areasData },
        { data: personasData },
        { data: archivosData },
        { data: subareasData },
      ] = await Promise.all([
        (supabase.from("empleados") as any).select(
          "id, nombre, nivel, area, color, horas_acumuladas",
        ),
        (supabase.from("proyectos") as any).select("id, nombre, logo_url"),
        (supabase.from("proyecto_areas") as any).select("proyecto_id, area"),
        (supabase.from("proyecto_empleados") as any).select(
          "proyecto_id, empleado_id",
        ),
        (supabase.from("proyecto_archivos") as any)
          .select(
            "id, proyecto_id, nombre, storage_path, url, subido_por, area, subarea, created_at",
          )
          .order("created_at", { ascending: false }),
        (supabase.from("proyecto_subareas") as any).select(
          "proyecto_id, area, subarea",
        ),
      ]);
      setEmpleados(empData || []);
      setProyectos(proyData || []);

      const areasMap: Record<string, Area[]> = {};
      (areasData || []).forEach((r: any) => {
        (areasMap[r.proyecto_id] ||= []).push(r.area);
      });
      setAreasPorProyecto(areasMap);

      const personasMap: Record<string, string[]> = {};
      (personasData || []).forEach((r: any) => {
        (personasMap[r.proyecto_id] ||= []).push(r.empleado_id);
      });
      setPersonasPorProyecto(personasMap);

      const archivosMap: Record<string, ArchivoReal[]> = {};
      (archivosData || []).forEach((r: any) => {
        (archivosMap[r.proyecto_id] ||= []).push(r);
      });
      setArchivosPorProyecto(archivosMap);

      const subareasMap: Record<string, string[]> = {};
      (subareasData || []).forEach((r: any) => {
        (subareasMap[`${r.proyecto_id}|${r.area}`] ||= []).push(r.subarea);
      });
      setSubareasPorProyectoArea(subareasMap);

      // Barrido de tamaños desde Storage (sin bloquear el render): una llamada
      // list() por línea de negocio; `metadata.size` viene en bytes.
      barrerEspacio(proyData || []);
    } catch (err) {
      console.error("Error cargando datos de Documentación Interna:", err);
    } finally {
      setLoading(false);
    }
  };

  const barrerEspacio = async (proys: Proyecto[]) => {
    if (proys.length === 0) return;
    setCalculandoEspacio(true);
    try {
      const listados = await Promise.all(
        proys.map((p) =>
          supabase.storage
            .from(ARCHIVOS_BUCKET)
            .list(`proyectos/${p.id}`, { limit: 1000 })
            .then((r: any) => ({ pid: p.id, objs: r.data || [] }))
            .catch(() => ({ pid: p.id, objs: [] as any[] })),
        ),
      );
      const mapa: Record<string, number> = {};
      listados.forEach(({ pid, objs }) => {
        objs.forEach((o: any) => {
          if (o?.name)
            mapa[`proyectos/${pid}/${o.name}`] = o.metadata?.size ?? 0;
        });
      });
      setTamanosPorPath(mapa);
    } catch (err) {
      console.error("Error calculando el espacio usado:", err);
    } finally {
      setCalculandoEspacio(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const currentEmpleado = empleados.find((e) => e.id === currentEmpleadoId);
  // Mientras no se sabe el nivel (carga inicial) se asume gestor para no bloquear
  // la vista; en cuanto se resuelve, solo 'Trabajador' queda restringido.
  const isGestor = !currentEmpleado || currentEmpleado.nivel !== "Trabajador";

  // Un Trabajador solo ve las líneas de negocio donde está asignado como equipo
  // (proyecto_empleados); Gerencia/Coordinador ven todas.
  const proyectosVisibles = isGestor
    ? proyectos
    : proyectos.filter((p) =>
        (personasPorProyecto[p.id] || []).includes(currentEmpleadoId || ""),
      );

  // Selecciona el primer proyecto visible como pestaña activa por defecto.
  useEffect(() => {
    if (
      (!activeProyectoId ||
        !proyectosVisibles.some((p) => p.id === activeProyectoId)) &&
      proyectosVisibles.length > 0
    ) {
      setActiveProyectoId(proyectosVisibles[0].id);
    }
  }, [proyectosVisibles, activeProyectoId]);

  const activeColor = getProyectoLogoColor(activeProyectoId);
  const activeProyecto = proyectos.find((p) => p.id === activeProyectoId);
  const activeLogoUrl = activeProyecto?.logo_url || null;

  const areasActivas = areasPorProyecto[activeProyectoId] || [];
  // Chips a mostrar: las 4 base + cualquier área propia que ya tenga esta línea
  // (una línea de negocio puede tener áreas que otras no tienen).
  const areasParaMostrar = Array.from(new Set([...AREAS, ...areasActivas]));
  const personasActivasIds = personasPorProyecto[activeProyectoId] || [];
  const personasActivas = personasActivasIds
    .map((id) => empleados.find((e) => e.id === id))
    .filter((e): e is Empleado => Boolean(e));
  // De los ya asignados al proyecto, solo los que pertenecen al área seleccionada
  // (antes se mostraba el equipo completo sin importar qué área estuviera activa).
  const personasActivasFiltradas = areaFiltro
    ? personasActivas.filter((e) => e.area === areaFiltro)
    : personasActivas;
  // Sub-áreas de la línea + área activas.
  const subareasActivas = areaFiltro
    ? subareasPorProyectoArea[`${activeProyectoId}|${areaFiltro}`] || []
    : [];

  // Filtros por columna: menús desplegables (estilo autofiltro de Excel). El valor
  // vacío = "todos"; cualquier otro valor es una coincidencia exacta.
  const proyectosMostrados = buscarProyecto
    ? proyectosVisibles.filter((p) => p.nombre === buscarProyecto)
    : proyectosVisibles;
  const areasMostradas = buscarArea
    ? areasParaMostrar.filter((a) => a === buscarArea)
    : areasParaMostrar;
  const subareasMostradas = buscarSubarea
    ? subareasActivas.filter((sa) => sa === buscarSubarea)
    : subareasActivas;
  const colaboradoresMostrados = buscarColaborador
    ? personasActivasFiltradas.filter((e) => e.nombre === buscarColaborador)
    : personasActivasFiltradas;

  // Archivos del proyecto, ya filtrados por: área/sub-área elegidas y, si hay un
  // colaborador seleccionado, solo los que subió esa persona. Los archivos viejos
  // sin `area` se muestran mientras no haya una sub-área seleccionada.
  const archivosDelProyecto = archivosPorProyecto[activeProyectoId] || [];
  const archivosActivos = archivosDelProyecto.filter((a) => {
    if (trabajadorFiltro && a.subido_por !== trabajadorFiltro) return false;
    if (areaFiltro && a.area && a.area !== areaFiltro) return false;
    if (subareaFiltro && a.subarea !== subareaFiltro) return false;
    return true;
  });

  // --- Franja de información: documentos, espacio y ruta ---
  const todosLosArchivos = Object.values(archivosPorProyecto).flat();
  const totalDocs = todosLosArchivos.length;
  const docsLinea = archivosDelProyecto.length;
  const espacioUsado = Object.entries(tamanosPorPath)
    .filter(([path]) => path.startsWith("proyectos/"))
    .reduce((s, [, b]) => s + b, 0);
  const pctEspacio = Math.min(100, (espacioUsado / STORAGE_LIMIT_BYTES) * 100);
  const conteoPorTipo = todosLosArchivos.reduce(
    (acc, a) => {
      acc[tipoDeArchivo(a.nombre)]++;
      return acc;
    },
    { pdf: 0, word: 0, excel: 0, otros: 0 },
  );
  const rutaSegmentos = [
    "documentacion",
    activeProyecto?.nombre,
    areaFiltro,
    subareaFiltro,
    trabajadorFiltro
      ? empleados.find((e) => e.id === trabajadorFiltro)?.nombre
      : null,
  ].filter((s): s is string => Boolean(s));

  // --- Métricas del panel de control ---
  const nombreEmpleado = (id?: string | null) =>
    empleados.find((e) => e.id === id)?.nombre || "—";
  const nombreProyecto = (id?: string | null) =>
    proyectos.find((p) => p.id === id)?.nombre || "—";

  const AHORA = Date.now();
  const sinClasificar = todosLosArchivos.filter(
    (a) => !a.area || !a.subarea,
  ).length;
  const archivosSemana = todosLosArchivos.filter(
    (a) => a.created_at && AHORA - new Date(a.created_at).getTime() < 7 * 864e5,
  ).length;
  const ultimoArchivo = [...todosLosArchivos].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || ""),
  )[0];
  const haceCuanto = (iso?: string) => {
    if (!iso) return "";
    const min = Math.round((AHORA - new Date(iso).getTime()) / 60000);
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    return `hace ${Math.round(min / 1440)} d`;
  };

  // Cobertura: % de sub-áreas de la línea activa (en todas sus áreas) con ≥1 archivo.
  const subareasDeLinea = Object.entries(subareasPorProyectoArea)
    .filter(([k]) => k.startsWith(`${activeProyectoId}|`))
    .flatMap(([k, arr]) => arr.map((sa) => ({ area: k.split("|")[1], sa })));
  const subareasConArchivo = subareasDeLinea.filter(({ area, sa }) =>
    archivosDelProyecto.some((a) => a.area === area && a.subarea === sa),
  ).length;
  const cobertura = subareasDeLinea.length
    ? Math.round((subareasConArchivo / subareasDeLinea.length) * 100)
    : null;

  const distribucionPorLinea = proyectosVisibles
    .map((p) => ({
      nombre: p.nombre,
      n: (archivosPorProyecto[p.id] || []).length,
    }))
    .sort((a, b) => b.n - a.n);
  const maxDist = Math.max(1, ...distribucionPorLinea.map((d) => d.n));

  const topColaboradores = Object.entries(
    todosLosArchivos.reduce<Record<string, number>>((acc, a) => {
      if (a.subido_por) acc[a.subido_por] = (acc[a.subido_por] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([id, n]) => ({ nombre: nombreEmpleado(id), n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  // Lista plana ordenada para el modal "Ver todos los archivos".
  const todosOrdenados = [...todosLosArchivos].sort((a, b) => {
    if (ordenTodos === "nombre") return a.nombre.localeCompare(b.nombre);
    if (ordenTodos === "peso")
      return (
        (tamanosPorPath[b.storage_path] || 0) -
        (tamanosPorPath[a.storage_path] || 0)
      );
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  const irAArchivo = (a: ArchivoReal) => {
    setActiveProyectoId(a.proyecto_id);
    setAreaFiltro(a.area || null);
    setSubareaFiltro(a.subarea || null);
    setTrabajadorFiltro(a.subido_por || null);
    setVerTodosOpen(false);
  };

  const exportarIndice = () => {
    const head = [
      "Linea de negocio",
      "Area",
      "Sub area",
      "Colaborador",
      "Archivo",
      "Fecha",
      "Peso (bytes)",
      "URL",
    ];
    const filas = todosOrdenados.map((a) =>
      [
        nombreProyecto(a.proyecto_id),
        a.area || "",
        a.subarea || "",
        nombreEmpleado(a.subido_por),
        a.nombre.replace(/"/g, "'"),
        a.created_at?.slice(0, 10) || "",
        tamanosPorPath[a.storage_path] || 0,
        a.url,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = ["﻿" + head.join(","), ...filas].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const el = document.createElement("a");
    el.href = url;
    el.download = `indice_documentacion_${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  // Sugeridos: personas de la misma área organizacional (empleados.area) que
  // el área seleccionada como filtro, y que todavía no están en el proyecto.
  const personasSugeridas = areaFiltro
    ? empleados.filter(
        (e) => e.area === areaFiltro && !personasActivasIds.includes(e.id),
      )
    : [];

  // Limpia los filtros por área/sub-área/trabajador al cambiar de línea de negocio
  // (las áreas, sub-áreas y personas seleccionables cambian de una línea a otra).
  useEffect(() => {
    setAreaFiltro(null);
    setSubareaFiltro(null);
    setTrabajadorFiltro(null);
  }, [activeProyectoId]);

  // La sub-área depende del área: al cambiar (o quitar) el área, se deselecciona.
  useEffect(() => {
    setSubareaFiltro(null);
  }, [areaFiltro]);

  // Toggle de Área — inserta/borra en `proyecto_areas` de verdad. Optimista en el
  // estado local; si falla, se revierte recargando desde la base de datos.
  const handleToggleArea = async (area: Area) => {
    const checked = areasActivas.includes(area);
    setAreasPorProyecto((prev) => {
      const cur = prev[activeProyectoId] || [];
      return {
        ...prev,
        [activeProyectoId]: checked
          ? cur.filter((a) => a !== area)
          : [...cur, area],
      };
    });

    try {
      if (checked) {
        const { error } = await (supabase.from("proyecto_areas") as any)
          .delete()
          .eq("proyecto_id", activeProyectoId)
          .eq("area", area);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("proyecto_areas") as any).insert(
          { proyecto_id: activeProyectoId, area },
        );
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Error actualizando área del proyecto:", err);
      alert(
        "No se pudo actualizar el área: " +
          (err.message || "Error de conexión"),
      );
      await fetchAll();
    }
  };

  // Agregar/quitar Trabajador — inserta/borra en `proyecto_empleados` de verdad.
  // Acepta un id explícito (usado por la lista de sugeridos por área) o, si no
  // se pasa ninguno, toma el elegido en el selector genérico.
  const handleAgregarPersona = async (empleadoIdParam?: string) => {
    const empleadoId = empleadoIdParam || personaAAgregar;
    if (!empleadoId || personasActivasIds.includes(empleadoId)) return;

    setPersonasPorProyecto((prev) => ({
      ...prev,
      [activeProyectoId]: [...(prev[activeProyectoId] || []), empleadoId],
    }));
    setPersonaAAgregar("");

    try {
      const { error } = await (
        supabase.from("proyecto_empleados") as any
      ).insert({ proyecto_id: activeProyectoId, empleado_id: empleadoId });
      if (error) throw error;
    } catch (err: any) {
      console.error("Error agregando persona al proyecto:", err);
      alert(
        "No se pudo agregar a la persona: " +
          (err.message || "Error de conexión"),
      );
      await fetchAll();
    }
  };

  const handleQuitarPersona = async (empleadoId: string) => {
    setPersonasPorProyecto((prev) => ({
      ...prev,
      [activeProyectoId]: (prev[activeProyectoId] || []).filter(
        (id) => id !== empleadoId,
      ),
    }));
    setTrabajadorFiltro((prev) => (prev === empleadoId ? null : prev));

    try {
      const { error } = await (supabase.from("proyecto_empleados") as any)
        .delete()
        .eq("proyecto_id", activeProyectoId)
        .eq("empleado_id", empleadoId);
      if (error) throw error;
    } catch (err: any) {
      console.error("Error quitando persona del proyecto:", err);
      alert(
        "No se pudo quitar a la persona: " +
          (err.message || "Error de conexión"),
      );
      await fetchAll();
    }
  };

  // Subir archivo — real: sube a Storage (bucket `documentacion`) y guarda los
  // metadatos en `proyecto_archivos`.
  const handleSubirArchivo = async (file: File) => {
    const path = `proyectos/${activeProyectoId}/${Date.now()}_${sanitizeFileName(file.name)}`;
    try {
      setSubiendoArchivo(true);
      const { error: uploadErr } = await supabase.storage
        .from(ARCHIVOS_BUCKET)
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from(ARCHIVOS_BUCKET)
        .getPublicUrl(path);

      const { data, error } = await (supabase.from("proyecto_archivos") as any)
        .insert({
          proyecto_id: activeProyectoId,
          nombre: file.name,
          storage_path: path,
          url: urlData?.publicUrl || "",
          subido_por: currentEmpleadoId,
          area: areaFiltro,
          subarea: subareaFiltro,
        })
        .select(
          "id, proyecto_id, nombre, storage_path, url, subido_por, area, subarea, created_at",
        )
        .single();
      if (error) throw error;

      setArchivosPorProyecto((prev) => ({
        ...prev,
        [activeProyectoId]: [data, ...(prev[activeProyectoId] || [])],
      }));
      setTamanosPorPath((prev) => ({ ...prev, [path]: file.size }));
      setArchivoRecienSubidoId(data.id);
      setTimeout(() => setArchivoRecienSubidoId(null), 1200);
    } catch (err: any) {
      console.error("Error subiendo archivo:", err);
      alert(
        "No se pudo subir el archivo: " + (err.message || "Error de conexión"),
      );
    } finally {
      setSubiendoArchivo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleQuitarArchivo = async (archivo: ArchivoReal) => {
    setArchivosPorProyecto((prev) => ({
      ...prev,
      [activeProyectoId]: (prev[activeProyectoId] || []).filter(
        (a) => a.id !== archivo.id,
      ),
    }));
    setTamanosPorPath((prev) => {
      const n = { ...prev };
      delete n[archivo.storage_path];
      return n;
    });

    try {
      await supabase.storage
        .from(ARCHIVOS_BUCKET)
        .remove([archivo.storage_path]);
      const { error } = await (supabase.from("proyecto_archivos") as any)
        .delete()
        .eq("id", archivo.id);
      if (error) throw error;
    } catch (err: any) {
      console.error("Error quitando archivo:", err);
      alert(
        "No se pudo quitar el archivo: " + (err.message || "Error de conexión"),
      );
      await fetchAll();
    }
  };

  const handleAgregarAreaCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const area = nuevaAreaNombre.trim();
    if (!area || areasActivas.includes(area)) return;

    try {
      setCreandoArea(true);
      const { error } = await (supabase.from("proyecto_areas") as any).insert({
        proyecto_id: activeProyectoId,
        area,
      });
      if (error) throw error;

      setAreasPorProyecto((prev) => ({
        ...prev,
        [activeProyectoId]: [...(prev[activeProyectoId] || []), area],
      }));
      setIsAddAreaOpen(false);
      setNuevaAreaNombre("");
    } catch (err: any) {
      console.error("Error agregando área a la línea de negocio:", err);
      alert(
        "No se pudo agregar el área: " + (err.message || "Error de conexión"),
      );
    } finally {
      setCreandoArea(false);
    }
  };

  const handleAgregarSubareaCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const subarea = nuevaSubareaNombre.trim();
    if (!subarea || !areaFiltro || subareasActivas.includes(subarea)) return;

    try {
      setCreandoSubarea(true);
      const { error } = await (
        supabase.from("proyecto_subareas") as any
      ).insert({ proyecto_id: activeProyectoId, area: areaFiltro, subarea });
      if (error) throw error;

      const key = `${activeProyectoId}|${areaFiltro}`;
      setSubareasPorProyectoArea((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), subarea],
      }));
      setIsAddSubareaOpen(false);
      setNuevaSubareaNombre("");
      setSubareaFiltro(subarea);
    } catch (err: any) {
      console.error("Error agregando sub área:", err);
      alert(
        "No se pudo agregar la sub área: " +
          (err.message || "Error de conexión"),
      );
    } finally {
      setCreandoSubarea(false);
    }
  };

  const handleCrearProyecto = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = nuevoProyectoNombre.trim();
    if (!nombre) return;

    try {
      setCreandoProyecto(true);
      const { data, error } = await (supabase.from("proyectos") as any)
        .insert({ nombre })
        .select("id, nombre")
        .single();

      if (error) throw error;

      setIsAddProyectoOpen(false);
      setNuevoProyectoNombre("");
      await fetchAll();
      if (data?.id) setActiveProyectoId(data.id);
    } catch (err: any) {
      console.error("Error creando línea de negocio:", err);
      alert(
        "No se pudo crear la línea de negocio: " +
          (err.message || "Error de conexión"),
      );
    } finally {
      setCreandoProyecto(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-1.5 md:p-2 overflow-hidden h-full min-w-0 bg-slate-50">
        {/* Encabezado: plano, sin degradado */}
        <div className="shrink-0 mb-1.5 flex items-center justify-between flex-wrap gap-1 pb-1.5 border-b border-slate-200">
          <div className="flex items-center gap-1.5">
            <span className="w-7 h-7 rounded-[9px] bg-blue-600 flex items-center justify-center shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
              </svg>
            </span>
            <div>
              <h1 className="m-0 text-[15px] font-semibold text-slate-900 tracking-tight leading-tight">
                Documentación Interna
              </h1>
              <p className="m-0 text-[11px] text-slate-400 leading-tight">
                Archivos y equipo, organizados por proyecto
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-slate-500">
              {proyectosVisibles.length} líneas de negocio
            </span>
          </div>
        </div>

        {/* Franja de información: ruta + documentos + espacio */}
        {!loading && proyectosVisibles.length > 0 && (
          <div className="shrink-0 mb-1.5 flex flex-col gap-1">
            {/* Barra: ruta tipo explorador + acciones del panel */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-1.5 py-1">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 flex-1 min-w-0 overflow-x-auto">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                </svg>
                {rutaSegmentos.map((seg, i) => {
                  const ultimo = i === rutaSegmentos.length - 1;
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <span className="text-slate-300 shrink-0">/</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (i === 0 || seg === activeProyecto?.nombre) {
                            setAreaFiltro(null);
                            setSubareaFiltro(null);
                            setTrabajadorFiltro(null);
                          } else if (seg === areaFiltro) {
                            setSubareaFiltro(null);
                            setTrabajadorFiltro(null);
                          } else if (seg === subareaFiltro) {
                            setTrabajadorFiltro(null);
                          }
                        }}
                        className={`shrink-0 whitespace-nowrap cursor-pointer transition-colors ${ultimo ? "font-bold text-slate-800" : "hover:text-blue-600"}`}
                      >
                        {seg}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 shrink-0 border-l border-slate-200 pl-1.5">
                <button
                  type="button"
                  onClick={() => setVerTodosOpen(true)}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 hover:bg-slate-50 text-[11px] font-medium px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                >
                  <Icon name="list" size={13} /> Ver todos
                  <span className="tabular-nums text-slate-400">
                    ({totalDocs})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={exportarIndice}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 hover:bg-slate-50 text-[11px] font-medium px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                >
                  <Icon name="download" size={13} /> Exportar
                </button>
              </div>
            </div>

            {/* Aviso de espacio */}
            {pctEspacio >= 80 && (
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium rounded-lg px-2 py-1 border ${
                  pctEspacio >= 95
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}
              >
                <Icon name="alert-triangle" size={13} className="shrink-0" />
                Espacio {pctEspacio >= 95 ? "casi lleno" : "alto"}:{" "}
                {formatBytes(espacioUsado)} de{" "}
                {formatBytes(STORAGE_LIMIT_BYTES)} ({Math.round(pctEspacio)}%).
                Depura archivos que ya no se usen.
              </div>
            )}

            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              {[
                {
                  label: "Documentos",
                  value: `${totalDocs}`,
                  sub: `${docsLinea} en esta línea`,
                },
                {
                  label: `Espacio usado${calculandoEspacio ? " …" : ""}`,
                  value: formatBytes(espacioUsado),
                  sub: `de ${formatBytes(STORAGE_LIMIT_BYTES)}`,
                },
                {
                  label: "Sin clasificar",
                  value: `${sinClasificar}`,
                  sub: sinClasificar
                    ? "falta área / sub área"
                    : "todo clasificado",
                  alerta: sinClasificar > 0,
                },
                {
                  label: "Nuevos (7 días)",
                  value: `${archivosSemana}`,
                  sub: ultimoArchivo
                    ? `último ${haceCuanto(ultimoArchivo.created_at)}`
                    : "sin actividad",
                },
                {
                  label: "Cobertura línea",
                  value: cobertura === null ? "—" : `${cobertura}%`,
                  sub:
                    cobertura === null
                      ? "sin sub áreas"
                      : `${subareasConArchivo}/${subareasDeLinea.length} sub áreas`,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="bg-white border border-slate-200 rounded-lg px-1.5 py-1"
                >
                  <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wide block truncate">
                    {m.label}
                  </span>
                  <div
                    className={`text-[15px] font-semibold leading-none my-0.5 tabular-nums ${
                      m.alerta ? "text-amber-600" : "text-slate-900"
                    }`}
                  >
                    {m.value}
                  </div>
                  <span className="text-[9px] text-slate-400 block truncate">
                    {m.sub}
                  </span>
                </div>
              ))}
            </div>

            {/* Por tipo + distribución por línea */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <div className="bg-white border border-slate-200 rounded-lg px-1.5 py-1">
                <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wide">
                  Por tipo
                </span>
                <div className="flex flex-wrap gap-x-2.5 gap-y-0 text-[10.5px] font-medium text-slate-600 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Icon
                      name="file-text"
                      size={11}
                      className="text-rose-500"
                    />
                    PDF {conteoPorTipo.pdf}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon
                      name="file-text"
                      size={11}
                      className="text-blue-500"
                    />
                    Word {conteoPorTipo.word}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon
                      name="file-text"
                      size={11}
                      className="text-emerald-500"
                    />
                    Excel {conteoPorTipo.excel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="file" size={11} className="text-slate-400" />
                    Otros {conteoPorTipo.otros}
                  </span>
                </div>
                {topColaboradores.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-slate-100 flex flex-wrap gap-x-2 gap-y-0 text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-400 uppercase text-[9px]">
                      Top:
                    </span>
                    {topColaboradores.map((c) => (
                      <span key={c.nombre}>
                        {c.nombre}{" "}
                        <strong className="text-slate-700">{c.n}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg px-1.5 py-1">
                <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wide">
                  Archivos por línea
                </span>
                <div className="mt-0.5 space-y-0.5 max-h-[52px] overflow-y-auto">
                  {distribucionPorLinea.slice(0, 5).map((d) => (
                    <div
                      key={d.nombre}
                      className="flex items-center gap-1 text-[10px] text-slate-600"
                    >
                      <span className="w-20 truncate shrink-0">{d.nombre}</span>
                      <span className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <span
                          className="block h-full bg-blue-500 rounded-full"
                          style={{ width: `${(d.n / maxDist) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 text-right tabular-nums font-semibold text-slate-700">
                        {d.n}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-500 gap-1">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Cargando proyectos...
          </div>
        ) : proyectosVisibles.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            {proyectos.length === 0
              ? "No hay proyectos registrados todavía."
              : "No estás asignado a ninguna línea de negocio todavía."}
          </p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-1.5 pb-0.5">
            {/* Columna 1: Líneas de Negocio */}
            <div
              className="flex flex-col bg-white rounded-xl p-1.5 border border-slate-200 overflow-y-auto h-[320px] xl:h-full"
              style={{
                animation: "column-in 320ms var(--ease-out-strong) backwards",
              }}
            >
              <div className="flex items-center justify-between px-1 pb-1 gap-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Linea de Negocio
                </span>
                {isGestor && (
                  <button
                    type="button"
                    title="Agregar línea de negocio"
                    onClick={() => setIsAddProyectoOpen(true)}
                    className="shrink-0 inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-md cursor-pointer bg-blue-600 text-white font-semibold text-[10px] shadow-sm hover:bg-blue-700 transition-colors duration-150 active:scale-[0.95]"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Agregar
                  </button>
                )}
              </div>
              <FiltroColumna
                value={buscarProyecto}
                onChange={setBuscarProyecto}
                opciones={proyectosVisibles.map((p) => p.nombre)}
                etiqueta="Todas las líneas"
              />
              <div className="flex flex-col gap-1.5">
                {proyectosMostrados.length === 0 && (
                  <span className="text-[11px] text-slate-400 px-1 py-1">
                    Sin resultados.
                  </span>
                )}
                {proyectosMostrados.map((p) => {
                  const isActive = activeProyectoId === p.id;
                  const color = getProyectoLogoColor(p.id);
                  const logoUrl = p.logo_url || null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.nombre}
                      onClick={() => setActiveProyectoId(p.id)}
                      className={`relative w-full flex items-center gap-2 p-1.5 rounded-xl overflow-hidden cursor-pointer bg-white border text-left transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.99] ${
                        isActive
                          ? "border-slate-300 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      <span className="w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 bg-white">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={p.nombre}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <span
                            className="w-full h-full flex items-center justify-center text-white text-lg font-bold"
                            style={{ backgroundColor: color }}
                          >
                            {getProyectoIniciales(p.nombre)}
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex-1 min-w-0 text-[13px] font-bold leading-tight break-words ${isActive ? "text-slate-900" : "text-slate-700"}`}
                      >
                        {p.nombre}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Columna 2: Área */}
            <div
              className="flex flex-col bg-white rounded-xl p-1.5 border border-slate-200 overflow-y-auto h-[320px] xl:h-full"
              style={{
                animation:
                  "column-in 320ms var(--ease-out-strong) 60ms backwards",
              }}
            >
              <div className="flex items-center justify-between px-1 pb-1 gap-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Area
                </span>
                {isGestor && (
                  <button
                    type="button"
                    title="Agregar área propia de esta línea de negocio"
                    onClick={() => setIsAddAreaOpen(true)}
                    className="shrink-0 inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-md cursor-pointer bg-blue-600 text-white font-semibold text-[10px] shadow-sm hover:bg-blue-700 transition-colors duration-150 active:scale-[0.95]"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Agregar
                  </button>
                )}
              </div>
              <FiltroColumna
                value={buscarArea}
                onChange={setBuscarArea}
                opciones={areasParaMostrar}
                etiqueta="Todas las áreas"
              />
              <div className="flex flex-col gap-1">
                {areasMostradas.length === 0 && (
                  <span className="text-[11px] text-slate-400 px-1 py-1">
                    Sin resultados.
                  </span>
                )}
                {areasMostradas.map((area) => {
                  const checked = areasActivas.includes(area);
                  const seleccionada = areaFiltro === area;
                  // Clic en la fila = selecciona/filtra esa área. El check de la izquierda
                  // (solo gestor) es lo que asigna/desasigna el área a la línea de negocio.
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => setAreaFiltro(seleccionada ? null : area)}
                      style={
                        seleccionada
                          ? {
                              animation:
                                "chip-pop 220ms var(--ease-out-strong)",
                            }
                          : undefined
                      }
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-left cursor-pointer transition-colors duration-150 ${
                        seleccionada
                          ? "bg-blue-600 text-white border border-blue-600"
                          : checked
                            ? "bg-blue-50 text-blue-700 border border-blue-100 hover:border-blue-200"
                            : "bg-white text-slate-600 border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {isGestor ? (
                        <span
                          role="button"
                          title={
                            checked
                              ? "Quitar área de esta línea de negocio"
                              : "Asignar área a esta línea de negocio"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleArea(area);
                          }}
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors duration-150 ${
                            checked
                              ? seleccionada
                                ? "bg-white border-white"
                                : "bg-blue-600 border-blue-600"
                              : seleccionada
                                ? "border-white/60"
                                : "border-slate-300"
                          }`}
                        >
                          {checked && (
                            <Icon
                              name="check"
                              size={9}
                              strokeWidth={4}
                              className={
                                seleccionada ? "text-blue-600" : "text-white"
                              }
                            />
                          )}
                        </span>
                      ) : (
                        <span
                          className={`w-4 h-4 flex items-center justify-center shrink-0 ${
                            checked
                              ? seleccionada
                                ? "text-white"
                                : "text-blue-700"
                              : "text-transparent"
                          }`}
                        >
                          <Icon name="check" size={11} strokeWidth={3} />
                        </span>
                      )}
                      <span className="flex-1 min-w-0 truncate">{area}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Columna 3: Sub (area) — bloqueada hasta elegir un Área */}
            <div
              className="flex flex-col bg-white rounded-xl p-1.5 border border-slate-200 overflow-y-auto h-[320px] xl:h-full"
              style={{
                animation:
                  "column-in 320ms var(--ease-out-strong) 120ms backwards",
              }}
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pb-1.5">
                Sub (area){areaFiltro ? ` · ${subareasActivas.length}` : ""}
              </span>

              {!areaFiltro ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-slate-300 py-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <span className="text-xs text-slate-400 text-center px-1.5">
                    Selecciona un área para ver sus sub áreas.
                  </span>
                </div>
              ) : (
                <div
                  key={areaFiltro}
                  style={{
                    animation: "panel-unlock 220ms var(--ease-out-strong)",
                  }}
                >
                  <div className="flex items-center justify-between px-1 pb-1 gap-1">
                    <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide truncate">
                      {areaFiltro}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {subareaFiltro && (
                        <button
                          type="button"
                          onClick={() => setSubareaFiltro(null)}
                          title="Quitar filtro de sub área"
                          className="text-slate-300 hover:text-slate-500 cursor-pointer"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      {isGestor && (
                        <button
                          type="button"
                          title="Agregar sub área a esta área"
                          onClick={() => setIsAddSubareaOpen(true)}
                          className="inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-md cursor-pointer bg-blue-600 text-white font-semibold text-[10px] shadow-sm hover:bg-blue-700 transition-colors duration-150 active:scale-[0.95]"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Agregar
                        </button>
                      )}
                    </span>
                  </div>

                  <FiltroColumna
                    value={buscarSubarea}
                    onChange={setBuscarSubarea}
                    opciones={subareasActivas}
                    etiqueta="Todas las sub áreas"
                  />
                  {subareasActivas.length === 0 ? (
                    <span className="text-[11px] text-slate-400 px-1 pb-1 block">
                      Esta área no tiene sub áreas todavía.
                    </span>
                  ) : (
                    subareasMostradas.length === 0 && (
                      <span className="text-[11px] text-slate-400 px-1 pb-1 block">
                        Sin resultados.
                      </span>
                    )
                  )}
                  <div className="flex flex-wrap gap-1">
                    {subareasMostradas.map((sa) => {
                      const seleccionada = subareaFiltro === sa;
                      return (
                        <button
                          key={sa}
                          type="button"
                          onClick={() =>
                            setSubareaFiltro(seleccionada ? null : sa)
                          }
                          style={
                            seleccionada
                              ? {
                                  animation:
                                    "chip-pop 220ms var(--ease-out-strong)",
                                }
                              : undefined
                          }
                          className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11.5px] font-semibold cursor-pointer transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
                            seleccionada
                              ? "bg-blue-600 text-white border border-blue-600 shadow-[0_4px_12px_-4px_rgba(37,99,235,0.5)]"
                              : "bg-blue-50 text-blue-700 border border-blue-100 hover:border-blue-200"
                          }`}
                        >
                          {sa}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Columna 4: Colaborador (Entregable Final) — fusión Trabajador + Archivo */}
            <div
              className="flex flex-col bg-white rounded-xl p-1.5 border border-slate-200 overflow-y-auto h-[320px] xl:h-full"
              style={{
                animation:
                  "column-in 320ms var(--ease-out-strong) 180ms backwards",
              }}
            >
              <div className="flex items-center justify-between shrink-0 pb-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">
                  Colaborador (Entregable Final)
                  {areaFiltro ? ` · ${personasActivasFiltradas.length}` : ""}
                </span>
                <label
                  className={`flex items-center gap-1 bg-blue-600 text-white text-[11px] font-semibold rounded-lg px-1.5 py-1 transition-[transform,background-color,opacity] duration-150 ease-out ${!areaFiltro || subiendoArchivo ? "opacity-50 cursor-not-allowed pointer-events-none" : "hover:bg-blue-700 cursor-pointer active:scale-[0.97]"}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 15V3M7 8l5-5 5 5" />
                    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  </svg>
                  {subiendoArchivo ? "Subiendo..." : "Subir"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    disabled={!areaFiltro || subiendoArchivo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSubirArchivo(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {!areaFiltro ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-slate-300 py-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <span className="text-xs text-slate-400 text-center px-1.5">
                    Selecciona un área para ver y asignar colaboradores.
                  </span>
                </div>
              ) : (
                <div
                  key={areaFiltro}
                  style={{
                    animation: "panel-unlock 220ms var(--ease-out-strong)",
                  }}
                >
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide truncate">
                      {areaFiltro}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAreaFiltro(null)}
                      title="Quitar filtro de área"
                      className="shrink-0 text-slate-300 hover:text-slate-500 cursor-pointer"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {subareaFiltro && (
                    <span className="text-[10px] font-semibold text-blue-500 px-1 pb-1 block">
                      Sub área: {subareaFiltro}
                    </span>
                  )}
                  {isGestor && (
                    <div className="flex gap-1 mb-1.5">
                      <select
                        value={personaAAgregar}
                        onChange={(e) => setPersonaAAgregar(e.target.value)}
                        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 text-slate-700 text-[11.5px] font-medium py-1 px-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="">+ Elegir persona...</option>
                        {empleados
                          .filter((e) => !personasActivasIds.includes(e.id))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nombre}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAgregarPersona()}
                        disabled={!personaAAgregar}
                        className="shrink-0 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold px-2 py-1 rounded-lg cursor-pointer shadow-sm disabled:bg-slate-200 disabled:shadow-none disabled:cursor-not-allowed transition-colors duration-150 active:enabled:scale-[0.98]"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Agregar
                      </button>
                    </div>
                  )}
                  <FiltroColumna
                    value={buscarColaborador}
                    onChange={setBuscarColaborador}
                    opciones={personasActivasFiltradas.map((e) => e.nombre)}
                    etiqueta="Todos los colaboradores"
                  />
                  <div className="flex flex-col gap-1">
                    {personasActivasFiltradas.length === 0 ? (
                      <span className="text-[11px] text-slate-400 px-1 pb-1">
                        Nadie de esta área en el equipo todavía.
                      </span>
                    ) : (
                      colaboradoresMostrados.length === 0 && (
                        <span className="text-[11px] text-slate-400 px-1 pb-1">
                          Sin resultados.
                        </span>
                      )
                    )}
                    {colaboradoresMostrados.map((emp, i) => {
                      const seleccionado = trabajadorFiltro === emp.id;
                      const archivosDeEmp = archivosActivos.filter(
                        (a) => a.subido_por === emp.id,
                      );
                      return (
                        <div
                          key={emp.id}
                          style={{
                            animation: `list-item-in 200ms ease-out ${Math.min(i, 6) * 35}ms backwards`,
                          }}
                          className={`group rounded-lg border transition-colors duration-150 ${
                            seleccionado
                              ? "border-blue-200 bg-blue-50/60"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div
                            role="button"
                            title="Ver solo sus entregables"
                            onClick={() =>
                              setTrabajadorFiltro(seleccionado ? null : emp.id)
                            }
                            className="flex items-center gap-1.5 px-1 py-1 cursor-pointer"
                          >
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                              style={{
                                backgroundColor: emp.color || getAvatarColor(i),
                              }}
                            >
                              {getProyectoIniciales(emp.nombre)}
                            </span>
                            <span
                              className={`flex-1 min-w-0 text-[12px] font-medium truncate ${seleccionado ? "text-blue-700" : "text-slate-700"}`}
                            >
                              {emp.nombre}
                            </span>
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400">
                              {archivosDeEmp.length}
                              <Icon name="file" size={10} />
                            </span>
                            {isGestor && (
                              <span
                                role="button"
                                title="Quitar del proyecto"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDialog({
                                    titulo: "Quitar del proyecto",
                                    mensaje: `¿Quitar a ${emp.nombre} de ${activeProyecto?.nombre}? Podrás volver a agregarla después.`,
                                    onConfirmar: () =>
                                      handleQuitarPersona(emp.id),
                                  });
                                }}
                                className="flex items-center justify-center text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                              </span>
                            )}
                          </div>

                          {archivosDeEmp.length > 0 && (
                            <div className="flex flex-col gap-0.5 px-1 pb-1">
                              {archivosDeEmp.map((archivo) => {
                                const st = getFileStyle(archivo.nombre);
                                const fecha = new Date(
                                  archivo.created_at,
                                ).toLocaleDateString("es-MX", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                });
                                const destaca =
                                  archivo.id === archivoRecienSubidoId;
                                return (
                                  <div
                                    key={archivo.id}
                                    style={
                                      destaca
                                        ? {
                                            animation:
                                              "row-highlight 1200ms ease-out",
                                          }
                                        : undefined
                                    }
                                    className="flex items-center gap-1 pl-2 pr-0.5 py-0.5 rounded-md border-l-2 hover:bg-white transition-colors"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: st.color }}
                                    />
                                    <a
                                      href={archivo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 min-w-0"
                                      title={archivo.nombre}
                                    >
                                      <span className="block text-[11px] font-medium text-slate-700 truncate hover:underline">
                                        {archivo.nombre}
                                      </span>
                                      <span className="block text-[9.5px] text-slate-400">
                                        {fecha}
                                        {archivo.subarea
                                          ? ` · ${archivo.subarea}`
                                          : ""}
                                        {tamanosPorPath[archivo.storage_path]
                                          ? ` · ${formatBytes(tamanosPorPath[archivo.storage_path])}`
                                          : ""}
                                      </span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDialog({
                                          titulo: "Eliminar archivo",
                                          mensaje: `¿Eliminar "${archivo.nombre}"? Esta acción no se puede deshacer.`,
                                          onConfirmar: () =>
                                            handleQuitarArchivo(archivo),
                                        })
                                      }
                                      title="Eliminar archivo"
                                      className="shrink-0 text-slate-300 hover:text-red-600 p-0.5 rounded cursor-pointer transition-[transform,color] duration-150 ease-out active:scale-[0.9]"
                                    >
                                      <svg
                                        width="11"
                                        height="11"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                                      </svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(() => {
                      const idsVisibles = new Set(
                        personasActivasFiltradas.map((e) => e.id),
                      );
                      const otros = archivosActivos.filter(
                        (a) => !a.subido_por || !idsVisibles.has(a.subido_por),
                      );
                      if (otros.length === 0) return null;
                      return (
                        <div className="mt-1 pt-1 border-t border-slate-100">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 block pb-0.5">
                            Otros archivos · {otros.length}
                          </span>
                          {otros.map((archivo) => {
                            const fecha = new Date(
                              archivo.created_at,
                            ).toLocaleDateString("es-MX", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            });
                            const quien =
                              empleados.find((e) => e.id === archivo.subido_por)
                                ?.nombre || "—";
                            return (
                              <div
                                key={archivo.id}
                                className="flex items-center gap-1 px-1 py-0.5"
                              >
                                <a
                                  href={archivo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 min-w-0"
                                  title={archivo.nombre}
                                >
                                  <span className="block text-[11px] font-medium text-slate-700 truncate hover:underline">
                                    {archivo.nombre}
                                  </span>
                                  <span className="block text-[9.5px] text-slate-400">
                                    {fecha} · subió: {quien}
                                    {tamanosPorPath[archivo.storage_path]
                                      ? ` · ${formatBytes(tamanosPorPath[archivo.storage_path])}`
                                      : ""}
                                  </span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDialog({
                                      titulo: "Eliminar archivo",
                                      mensaje: `¿Eliminar "${archivo.nombre}"? Esta acción no se puede deshacer.`,
                                      onConfirmar: () =>
                                        handleQuitarArchivo(archivo),
                                    })
                                  }
                                  title="Eliminar archivo"
                                  className="shrink-0 text-slate-300 hover:text-red-600 p-0.5 rounded cursor-pointer"
                                >
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {isGestor && (
                    <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pb-0.5">
                        Sugeridos de esta área
                      </span>
                      {personasSugeridas.length === 0 ? (
                        <span className="text-[11px] text-slate-400 px-1 pb-1">
                          Nadie de esa área disponible.
                        </span>
                      ) : (
                        personasSugeridas.map((emp, i) => (
                          <div
                            key={emp.id}
                            style={{
                              animation: `list-item-in 200ms ease-out ${Math.min(i, 6) * 35}ms backwards`,
                            }}
                            className="flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-slate-50 transition-colors duration-150"
                          >
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                              style={{
                                backgroundColor: emp.color || getAvatarColor(i),
                              }}
                            >
                              {getProyectoIniciales(emp.nombre)}
                            </span>
                            <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 truncate">
                              {emp.nombre}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAgregarPersona(emp.id)}
                              title="Agregar al proyecto"
                              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer transition-[transform,background-color] duration-150 ease-out active:scale-[0.9]"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal: nueva línea de negocio (proyecto real) */}
      {isAddProyectoOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2"
          style={{ animation: "modal-backdrop-in 150ms ease-out" }}
        >
          <div
            className="bg-white w-full max-w-sm rounded-xl shadow-lg border border-slate-200 p-3 space-y-2 origin-center"
            style={{ animation: "modal-panel-in 180ms var(--ease-out-strong)" }}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                Nueva línea de negocio
              </h3>
              <button
                onClick={() => {
                  setIsAddProyectoOpen(false);
                  setNuevoProyectoNombre("");
                }}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer transition-[transform,color] duration-150 ease-out active:scale-90"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCrearProyecto} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Nombre del proyecto
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. NUEVA LÍNEA"
                  value={nuevoProyectoNombre}
                  onChange={(e) => setNuevoProyectoNombre(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProyectoOpen(false);
                    setNuevoProyectoNombre("");
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoProyecto || !nuevoProyectoNombre.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-1.5 rounded-xl font-bold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:enabled:scale-[0.98]"
                >
                  {creandoProyecto ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: nueva área propia de la línea de negocio activa */}
      {isAddAreaOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2"
          style={{ animation: "modal-backdrop-in 150ms ease-out" }}
        >
          <div
            className="bg-white w-full max-w-sm rounded-xl shadow-lg border border-slate-200 p-3 space-y-2 origin-center"
            style={{ animation: "modal-panel-in 180ms var(--ease-out-strong)" }}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                Nueva área para {activeProyecto?.nombre}
              </h3>
              <button
                onClick={() => {
                  setIsAddAreaOpen(false);
                  setNuevaAreaNombre("");
                }}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer transition-[transform,color] duration-150 ease-out active:scale-90"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form
              onSubmit={handleAgregarAreaCustom}
              className="space-y-2 text-xs"
            >
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Nombre del área
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Diseño"
                  value={nuevaAreaNombre}
                  onChange={(e) => setNuevaAreaNombre(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[10.5px] text-slate-400">
                  Solo se agrega a esta línea de negocio, no afecta a las demás.
                </p>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddAreaOpen(false);
                    setNuevaAreaNombre("");
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoArea || !nuevaAreaNombre.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-1.5 rounded-xl font-bold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:enabled:scale-[0.98]"
                >
                  {creandoArea ? "Agregando..." : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: nueva sub área de la área activa */}
      {isAddSubareaOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2"
          style={{ animation: "modal-backdrop-in 150ms ease-out" }}
        >
          <div
            className="bg-white w-full max-w-sm rounded-xl shadow-lg border border-slate-200 p-3 space-y-2 origin-center"
            style={{ animation: "modal-panel-in 180ms var(--ease-out-strong)" }}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                Nueva sub área de "{areaFiltro}"
              </h3>
              <button
                onClick={() => {
                  setIsAddSubareaOpen(false);
                  setNuevaSubareaNombre("");
                }}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer transition-[transform,color] duration-150 ease-out active:scale-90"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form
              onSubmit={handleAgregarSubareaCustom}
              className="space-y-2 text-xs"
            >
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Nombre de la sub área
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Render"
                  value={nuevaSubareaNombre}
                  onChange={(e) => setNuevaSubareaNombre(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-[10.5px] text-slate-400">
                  Se agrega al área "{areaFiltro}" de esta línea de negocio.
                </p>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddSubareaOpen(false);
                    setNuevaSubareaNombre("");
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoSubarea || !nuevaSubareaNombre.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-1.5 rounded-xl font-bold cursor-pointer transition-[transform,background-color] duration-150 ease-out active:enabled:scale-[0.98]"
                >
                  {creandoSubarea ? "Agregando..." : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: confirmación real antes de borrar archivo o quitar a alguien del proyecto */}
      {confirmDialog && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2"
          style={{ animation: "modal-backdrop-in 150ms ease-out" }}
        >
          <div
            className="bg-white w-full max-w-sm rounded-xl shadow-lg border border-slate-200 p-3 space-y-2 origin-center"
            style={{ animation: "modal-panel-in 180ms var(--ease-out-strong)" }}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                {confirmDialog.titulo}
              </h3>
              <button
                onClick={() => setConfirmDialog(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer transition-[transform,color] duration-150 ease-out active:scale-90"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600">{confirmDialog.mensaje}</p>
            <div className="flex gap-1 pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer text-xs transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirmar();
                  setConfirmDialog(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded-xl font-bold cursor-pointer text-xs transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: índice plano de todos los archivos */}
      {verTodosOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-slate-100 px-3 py-2 shrink-0">
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900">
                  Todos los archivos ({todosLosArchivos.length})
                </h3>
                <p className="text-[10.5px] text-slate-400">
                  Clic en una fila para ir a su ubicación.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={ordenTodos}
                  onChange={(e) => setOrdenTodos(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] py-1 px-1.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="fecha">Más recientes</option>
                  <option value="peso">Más pesados</option>
                  <option value="nombre">Nombre (A-Z)</option>
                </select>
                <button
                  type="button"
                  onClick={exportarIndice}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg cursor-pointer"
                >
                  <Icon name="download" size={12} /> CSV
                </button>
                <button
                  onClick={() => setVerTodosOpen(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-[9.5px] uppercase text-slate-400 tracking-wide">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Archivo</th>
                    <th className="px-2 py-1.5 font-semibold">Línea</th>
                    <th className="px-2 py-1.5 font-semibold">Área / Sub</th>
                    <th className="px-2 py-1.5 font-semibold">Colaborador</th>
                    <th className="px-2 py-1.5 font-semibold">Fecha</th>
                    <th className="px-2 py-1.5 font-semibold text-right">
                      Peso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todosOrdenados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 py-6 text-center text-slate-400"
                      >
                        No hay archivos registrados.
                      </td>
                    </tr>
                  ) : (
                    todosOrdenados.map((a) => {
                      const st = getFileStyle(a.nombre);
                      return (
                        <tr
                          key={a.id}
                          onClick={() => irAArchivo(a)}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-2 py-1.5 max-w-[220px]">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: st.color }}
                              />
                              <span className="font-medium text-slate-800 truncate">
                                {a.nombre}
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[120px]">
                            {nombreProyecto(a.proyecto_id)}
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 truncate max-w-[140px]">
                            {a.area || "—"}
                            {a.subarea ? ` / ${a.subarea}` : ""}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[120px]">
                            {nombreEmpleado(a.subido_por)}
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 font-mono whitespace-nowrap">
                            {a.created_at?.slice(0, 10) || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-500 font-mono whitespace-nowrap">
                            {tamanosPorPath[a.storage_path]
                              ? formatBytes(tamanosPorPath[a.storage_path])
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Siluetas de carga ("skeletons") de la PWA: misma forma que el contenido real
// para que la pantalla no salte cuando llegan los datos.

function Bloque({ className = "" }: { className?: string }) {
  // Redondeo por defecto solo si no se pidió otro (dos clases rounded-* chocan).
  const redondeo = /\brounded/.test(className) ? "" : "rounded-md";
  return <div className={`animate-pulse bg-slate-200 ${redondeo} ${className}`} />;
}

function Contenedor({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">{children}</div>;
}

function TarjetaTarea() {
  return (
    <Tarjeta>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bloque className="w-[26px] h-[26px] rounded-full" />
          <Bloque className="w-20 h-3.5" />
        </div>
        <Bloque className="w-16 h-5" />
      </div>
      <Bloque className="w-4/5 h-4 mt-3" />
      <div className="flex justify-between mt-3">
        <Bloque className="w-24 h-3" />
        <Bloque className="w-8 h-3" />
      </div>
      <Bloque className="w-full h-1.5 mt-2 rounded-full" />
    </Tarjeta>
  );
}

// /movil — encabezado completo + resumen + filtros + tarjetas.
export function EsqueletoTareas() {
  return (
    <Contenedor>
      <div className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <Bloque className="w-11 h-11 rounded-full" />
          <div className="flex-1">
            <Bloque className="w-24 h-3" />
            <Bloque className="w-44 h-4 mt-2" />
          </div>
        </div>
        <Bloque className="w-full h-9 mt-3 rounded-[10px]" />
      </div>
      <div className="flex gap-2 px-4 pt-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
            <Bloque className="w-14 h-2.5" />
            <Bloque className="w-6 h-5 mt-2" />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 px-4 pt-3 pb-2">
        <Bloque className="w-32 h-9 rounded-full" />
        <Bloque className="w-24 h-9 rounded-full" />
        <Bloque className="w-24 h-9 rounded-full" />
      </div>
      <div className="px-4 flex flex-col gap-2.5">
        <TarjetaTarea />
        <TarjetaTarea />
        <TarjetaTarea />
      </div>
    </Contenedor>
  );
}

function FilaPersona() {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <Bloque className="w-10 h-10 rounded-full" />
      <div className="flex-1">
        <Bloque className="w-36 h-3.5" />
        <Bloque className="w-24 h-3 mt-1.5" />
      </div>
      <Bloque className="w-16 h-3" />
    </div>
  );
}

// /movil/equipo — encabezado + filtros + grupos de personas.
export function EsqueletoEquipo() {
  return (
    <Contenedor>
      <div className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <Bloque className="w-24 h-5" />
          <Bloque className="w-20 h-8 rounded-full" />
        </div>
        <Bloque className="w-48 h-3 mt-2.5" />
        <Bloque className="w-40 h-3 mt-2.5" />
      </div>
      <div className="flex gap-1.5 px-4 pt-3 pb-2">
        <Bloque className="w-16 h-9 rounded-full" />
        <Bloque className="w-24 h-9 rounded-full" />
        <Bloque className="w-24 h-9 rounded-full" />
      </div>
      <div className="px-4 pt-1 flex flex-col gap-3">
        {[3, 2].map((n, g) => (
          <div key={g}>
            <Bloque className="w-28 h-2.5 mb-2" />
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {Array.from({ length: n }, (_, i) => <FilaPersona key={i} />)}
            </div>
          </div>
        ))}
      </div>
    </Contenedor>
  );
}

// /movil/avisos — solo el cuerpo (el encabezado lo pinta la página).
export function EsqueletoAvisos() {
  return (
    <Contenedor className="px-4 pt-3 flex flex-col gap-2">
      <Bloque className="w-20 h-2.5 mt-2" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 flex gap-3">
          <Bloque className="w-[38px] h-[38px] rounded-[10px]" />
          <div className="flex-1">
            <Bloque className="w-4/5 h-3.5" />
            <Bloque className="w-3/5 h-3 mt-2" />
          </div>
        </div>
      ))}
    </Contenedor>
  );
}

// Seguimiento / Revisión — tarjeta de título, persona, avance e hilo.
export function EsqueletoDetalle() {
  return (
    <Contenedor className="px-4 py-3 flex flex-col gap-2.5">
      <Tarjeta>
        <div className="flex gap-2">
          <Bloque className="w-24 h-5" />
          <Bloque className="w-14 h-5" />
        </div>
        <Bloque className="w-3/4 h-5 mt-3" />
        <Bloque className="w-full h-3 mt-2.5" />
        <Bloque className="w-2/3 h-3 mt-1.5" />
      </Tarjeta>
      <Tarjeta>
        <div className="flex items-center gap-3">
          <Bloque className="w-[42px] h-[42px] rounded-full" />
          <div className="flex-1">
            <Bloque className="w-32 h-3.5" />
            <Bloque className="w-24 h-3 mt-1.5" />
          </div>
        </div>
      </Tarjeta>
      <Tarjeta>
        <div className="flex justify-between">
          <Bloque className="w-28 h-3" />
          <Bloque className="w-10 h-5" />
        </div>
        <Bloque className="w-full h-2 mt-3 rounded-full" />
      </Tarjeta>
      <Bloque className="w-24 h-2.5 mt-2" />
      {[0, 1].map((i) => (
        <div key={i} className="ml-6">
          <Tarjeta>
            <Bloque className="w-1/2 h-3.5" />
            <Bloque className="w-4/5 h-3 mt-2" />
          </Tarjeta>
        </div>
      ))}
    </Contenedor>
  );
}

// Mi perfil — identidad + filas de datos.
export function EsqueletoPerfil() {
  return (
    <Contenedor className="px-4 pt-3 flex flex-col gap-2.5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center">
        <Bloque className="w-[76px] h-[76px] rounded-full" />
        <Bloque className="w-44 h-5 mt-3" />
        <Bloque className="w-32 h-3 mt-2" />
        <Bloque className="w-full h-11 mt-4 rounded-[11px]" />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl px-4 divide-y divide-slate-100">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 py-3.5">
            <Bloque className="w-20 h-3.5" />
            <Bloque className="w-36 h-3.5" />
          </div>
        ))}
      </div>
    </Contenedor>
  );
}

// Formularios (Asignar, Editar perfil): etiquetas + campos.
export function EsqueletoFormulario({ campos = 5 }: { campos?: number }) {
  return (
    <Contenedor className="px-4 py-3 flex flex-col gap-3.5">
      {Array.from({ length: campos }, (_, i) => (
        <div key={i}>
          <Bloque className="w-24 h-3 mb-2" />
          <Bloque className="w-full h-12 rounded-xl" />
        </div>
      ))}
    </Contenedor>
  );
}

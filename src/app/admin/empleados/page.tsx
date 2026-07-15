'use client';

import React, { useState, useMemo } from 'react';

// Datos iniciales simulados del equipo con el nuevo formato de Disponibilidad
const INITIAL_EMPLOYEES = [
  { id: '1', name: 'Carlos Pérez', role: 'Developer', email: 'carlos@empresa.com', status: 'Ocupado', completedTasks: 24, avatar: '👨‍💻' },
  { id: '2', name: 'Ana Gómez', role: 'Diseñadora UX', email: 'ana@empresa.com', status: 'Ocupado', completedTasks: 18, avatar: '👩‍🎨' },
  { id: '3', name: 'Luis Martínez', role: 'QA Tester', email: 'luis@empresa.com', status: 'Disponible', completedTasks: 31, avatar: '👨‍🔧' },
  { id: '4', name: 'Sofía Díaz', role: 'Backend Dev', email: 'sofia@empresa.com', status: 'Ocupado', completedTasks: 15, avatar: '👩‍💻' },
];

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  
  // Estados para búsqueda y formulario
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Developer');
  const [newEmail, setNewEmail] = useState('');

  // Filtrar empleados dinámicamente según la barra de búsqueda
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

  // Manejador para agregar un empleado al estado
  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    const avatars: Record<string, string> = {
      'Developer': '👨‍💻',
      'Backend Dev': '👩‍💻',
      'Diseñadora UX': '👩‍🎨',
      'QA Tester': '👨‍🔧',
      'Gerente de Proyecto': '🧑‍💼'
    };

    const newEmp = {
      id: (employees.length + 1).toString(),
      name: newName,
      role: newRole,
      email: newEmail,
      status: 'Disponible',
      completedTasks: 0,
      avatar: avatars[newRole] || '👤'
    };

    setEmployees([...employees, newEmp]);
    
    // Limpiar y cerrar
    setNewName('');
    setNewEmail('');
    setNewRole('Developer');
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans select-none">
      
      {/* BARRA LATERAL (SIDEBAR) - Ajustada exactamente a w-60 y p-3 */}
      <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0 hidden md:flex">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <span className="text-xl">💼</span>
          <span className="font-bold text-white text-base tracking-tight">CRM Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <a href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
            📊 Panel Principal
          </a>
          <a href="/admin/empleados" className="flex items-center gap-3 px-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium transition-all">
            👥 Empleados
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
            📝 Historial Tareas
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          v1.0.0 - Modo Fijo
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-5 overflow-y-auto min-w-0">
        
        {/* Encabezado Compacto */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gestión del Equipo</h1>
            <p className="text-xs text-slate-500">Alta de personal, roles y estado de disponibilidad</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-all active:scale-[0.98]"
          >
            + Registrar Empleado
          </button>
        </header>

        {/* BARRA DE BÚSQUEDA */}
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm mb-6 flex items-center">
          <span className="text-slate-400 mr-2 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre o puesto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs text-slate-700 focus:outline-none placeholder-slate-400"
          />
        </div>

        {/* REJILLA DE TARJETAS DE EMPLEADOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => (
            <div key={emp.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden">
              
              {/* Contenido Superior */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-inner shrink-0">
                  {emp.avatar}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{emp.name}</h3>
                  <p className="text-[11px] text-blue-600 font-medium">{emp.role}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{emp.email}</p>
                </div>
              </div>

              {/* Estadísticas internas compactas */}
              <div className="grid grid-cols-2 gap-2 my-3 pt-2.5 border-t border-slate-50 bg-slate-50/50 rounded-lg p-2.5 text-center">
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tareas OK</span>
                  <span className="text-sm font-bold text-slate-700">{emp.completedTasks}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                  <div className="mt-0.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      emp.status === 'Disponible' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      <span className={`h-1 w-1 rounded-full ${emp.status === 'Disponible' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      {emp.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón de Perfil */}
              <button className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold py-1.5 rounded-lg text-[11px] transition-colors">
                ⚙️ Configurar Accesos
              </button>
            </div>
          ))}

          {filteredEmployees.length === 0 && (
            <div className="col-span-full text-center py-12 text-xs text-slate-400">
              No se encontraron miembros con ese nombre o puesto.
            </div>
          )}
        </div>
      </main>

      {/* MODAL: FORMULARIO REGISTRAR EMPLEADO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl p-5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Registrar Nuevo Colaborador</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 text-base">✕</button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre Completo</label>
                <input
                  type="text" required placeholder="Ej. Juan Escutia" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Correo Institucional</label>
                <input
                  type="email" required placeholder="juan@empresa.com" value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Puesto / Rol</label>
                <select
                  value={newRole} onChange={(e) => setNewRole(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                >
                  <option value="Developer">Developer</option>
                  <option value="Backend Dev">Backend Dev</option>
                  <option value="Diseñadora UX">Diseñadora UX</option>
                  <option value="QA Tester">QA Tester</option>
                  <option value="Gerente de Proyecto">Gerente de Proyecto</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 mt-3">
                <button
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold shadow-md shadow-blue-200"
                >
                  Dar de Alta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
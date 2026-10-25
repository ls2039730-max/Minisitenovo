import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Tenant, User } from '../../types/saas';
import { getTenantSubdomain } from '../../utils/url';
import { Users, Shield, Building2, Search, CheckCircle2, UserX } from 'lucide-react';

interface UsersGlobalViewProps {
  tenants: Tenant[];
}

export const UsersGlobalView: React.FC<UsersGlobalViewProps> = ({ tenants }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const tenantMap = React.useMemo(() => {
    const map = new Map<string, Tenant>();
    tenants.forEach((t) => map.set(t.id, t));
    return map;
  }, [tenants]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error loading global users:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const tenant = u.tenantId ? tenantMap.get(u.tenantId) : null;
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (tenant && tenant.name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuários da Plataforma</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Listagem consolidada de administradores da plataforma e gestores de empresas locais.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou empresa..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando usuários...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-6">Usuário</th>
                  <th className="py-3 px-4">Papel (Role)</th>
                  <th className="py-3 px-4">Empresa / Tenant</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredUsers.map((user) => {
                  const tenant = user.tenantId ? tenantMap.get(user.tenantId) : null;
                  const isSuperAdmin = user.role === 'SUPER_ADMIN';

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-[11px] text-slate-400">{user.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isSuperAdmin
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {isSuperAdmin ? (
                            <Shield className="w-3 h-3 text-purple-500" />
                          ) : (
                            <Building2 className="w-3 h-3 text-indigo-500" />
                          )}
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isSuperAdmin ? (
                          <span className="text-slate-400 font-medium italic">Global (Todas as empresas)</span>
                        ) : tenant ? (
                          <div>
                            <span className="font-semibold text-slate-800">{tenant.name}</span>
                            <span className="block text-[11px] font-mono text-slate-400">{getTenantSubdomain(tenant.slug)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Sem tenant</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            user.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {user.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

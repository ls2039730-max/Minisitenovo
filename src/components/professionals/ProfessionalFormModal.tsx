import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Briefcase,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  Eye,
  Check,
} from 'lucide-react';
import { Professional, Service } from '../../types/service';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { ImageUpload } from '../common/ImageUpload';

interface ProfessionalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional | null;
  services: Service[];
  tenant: Tenant;
  onSaved: () => void;
}

export const ProfessionalFormModal: React.FC<ProfessionalFormModalProps> = ({
  isOpen,
  onClose,
  professional,
  services,
  tenant,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showContactPublicly, setShowContactPublicly] = useState(false);
  const [active, setActive] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (professional) {
      setName(professional.name || '');
      setBio(professional.bio || '');
      setPhotoUrl(professional.photoUrl || '');
      setSpecialties(professional.specialties || []);
      setPhone(professional.phone || '');
      setEmail(professional.email || '');
      setShowContactPublicly(professional.showContactPublicly === true);
      setActive(professional.active !== false);
      setSelectedServiceIds(professional.serviceIds || []);
    } else {
      setName('');
      setBio('');
      setPhotoUrl('');
      setSpecialties([]);
      setPhone('');
      setEmail('');
      setShowContactPublicly(false);
      setActive(true);
      setSelectedServiceIds([]);
    }
    setNewSpecialtyInput('');
    setError(null);
  }, [professional, isOpen]);

  if (!isOpen) return null;

  const handleAddSpecialty = () => {
    const trimmed = newSpecialtyInput.trim();
    if (trimmed && !specialties.includes(trimmed)) {
      setSpecialties([...specialties, trimmed]);
      setNewSpecialtyInput('');
    }
  };

  const handleRemoveSpecialty = (spec: string) => {
    setSpecialties(specialties.filter((s) => s !== spec));
  };

  const handleToggleService = (svcId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(svcId) ? prev.filter((id) => id !== svcId) : [...prev, svcId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do profissional é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: name.trim(),
        bio: bio.trim() || null,
        photoUrl: photoUrl.trim() || null,
        specialties,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || null,
        showContactPublicly,
        active,
        serviceIds: selectedServiceIds,
      };

      if (professional) {
        await api.updateProfessional(professional.id, payload);
      } else {
        await api.createProfessional(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar profissional.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {professional ? 'Editar Profissional' : 'Novo Profissional'}
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre a equipe com foto, especialidades, bio e serviços atribuídos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              1. Identificação & Perfil
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome Completo ou Nome Profissional *
              </label>
              <input
                type="text"
                placeholder="Ex: Carlos Silva ou Dr. Lucas Mendes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Photo Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Foto do Profissional
              </label>
              <ImageUpload
                value={photoUrl}
                onChange={(url) => setPhotoUrl(url)}
                subfolder="professionals"
                aspectRatio="square"
                helperText="Envie uma foto de perfil profissional de boa qualidade (PNG, JPG, WEBP até 5MB)"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Apresentação / Biografia Breve
              </label>
              <textarea
                rows={3}
                placeholder="Experiência, formação, diferenciais e estilo de atendimento..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            </div>

            {/* Specialties Tags */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Especialidades (Tags de Destaque)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Ex: Degradê Navalhado, Visagismo, Barba Terapia..."
                  value={newSpecialtyInput}
                  onChange={(e) => setNewSpecialtyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSpecialty();
                    }
                  }}
                  className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddSpecialty}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>

              {specialties.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {specialties.map((spec) => (
                    <span
                      key={spec}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs"
                    >
                      <span>{spec}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialty(spec)}
                        className="text-slate-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Contact Information & Privacy */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                2. Contato & Privacidade dos Dados
              </h4>
              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                Protegido por padrão
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Os dados de contato do profissional ficam restritos à administração interna e nunca são expostos publicamente, a menos que você autorize expressamente.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp Profissional
                </label>
                <input
                  type="text"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail do Profissional
                </label>
                <input
                  type="email"
                  placeholder="profissional@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Utilizado para vincular o login de usuário com perfil "Profissional" à sua agenda exclusiva.
                </p>
              </div>
            </div>

            {/* Public Exposure Toggle */}
            <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
              <div className="pr-3">
                <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  Exibir telefone/e-mail no mini site público
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Desmarcado por padrão. Ative somente se desejar que clientes vejam o contato direto deste profissional.
                </span>
              </div>
              <input
                type="checkbox"
                checked={showContactPublicly}
                onChange={(e) => setShowContactPublicly(e.target.checked)}
                className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
            </label>
          </div>

          {/* Section 3: Associated Services */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                3. Serviços Atribuídos a este Profissional
              </h4>
              <span className="text-[11px] text-slate-500 font-semibold">
                {selectedServiceIds.length} selecionado(s)
              </span>
            </div>

            {services.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                <Briefcase className="w-6 h-6 mx-auto mb-1 opacity-40 text-slate-400" />
                Nenhum serviço cadastrado ainda. Você poderá vinculá-los depois.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {services.map((svc) => {
                  const isChecked = selectedServiceIds.includes(svc.id);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => handleToggleService(svc.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="block font-bold text-xs text-slate-900 truncate">
                          {svc.name}
                        </span>
                        {svc.durationMinutes && (
                          <span className="text-[10px] text-slate-400 block">
                            ⏱ {svc.durationMinutes} min
                          </span>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Status */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
              <div>
                <span className="font-bold text-xs text-slate-900 block">Profissional Ativo</span>
                <span className="text-[11px] text-slate-500 block">
                  Profissionais inativos ficam ocultos do mini site público e não recebem novos agendamentos.
                </span>
              </div>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
            </label>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {professional ? 'Salvar Alterações' : 'Cadastrar Profissional'}
          </button>
        </div>
      </div>
    </div>
  );
};

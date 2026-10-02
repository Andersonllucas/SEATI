'use client';

import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Pencil,
  Trash2,
  Check,
  ExternalLink,
  Link2,
  UserPlus,
  MessageCircle,
  FileText,
  Globe,
  Star,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { useAuth, CustomHeaderButton } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { useToast } from '@/context/ToastContext';
import { safeStorage } from '@/lib/safeStorage';

export function HeaderButtonsManager() {
  const { systemConfig, atualizarConfiguracoes, registrarLog } = useAuth();
  const { subdomain } = useTenant();
  const { showToast } = useToast();

  const storageKey = `adti_custom_buttons_${subdomain || 'default'}`;

  // Current buttons from systemConfig or localStorage fallback
  const currentButtons: CustomHeaderButton[] = React.useMemo(() => {
    if (systemConfig?.botoesCabecalho && Array.isArray(systemConfig.botoesCabecalho)) {
      return systemConfig.botoesCabecalho;
    }
    const stored = safeStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }, [systemConfig?.botoesCabecalho, storageKey]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [targetBlank, setTargetBlank] = useState(false);
  const [variant, setVariant] = useState<'primary' | 'secondary' | 'outline' | 'surface'>('primary');
  const [icon, setIcon] = useState<'link' | 'user' | 'chat' | 'file' | 'globe' | 'star' | 'external'>('link');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenAdd = () => {
    setEditingId(null);
    setLabel('');
    setUrl('');
    setTargetBlank(false);
    setVariant('primary');
    setIcon('link');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (btn: CustomHeaderButton) => {
    setEditingId(btn.id);
    setLabel(btn.label);
    setUrl(btn.url);
    setTargetBlank(!!btn.targetBlank);
    setVariant(btn.variant || 'primary');
    setIcon(btn.icon || 'link');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveButton = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setFormError('Informe o nome do botão.');
      return;
    }
    if (!url.trim()) {
      setFormError('Informe o link de direcionamento (ex: /eleitores ou https://...).');
      return;
    }

    let formattedUrl = url.trim();
    if (
      !formattedUrl.startsWith('/') &&
      !formattedUrl.startsWith('http://') &&
      !formattedUrl.startsWith('https://') &&
      !formattedUrl.startsWith('mailto:') &&
      !formattedUrl.startsWith('tel:')
    ) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setIsSaving(true);
    try {
      let updated: CustomHeaderButton[];

      if (editingId) {
        updated = currentButtons.map((b) =>
          b.id === editingId
            ? {
                ...b,
                label: label.trim(),
                url: formattedUrl,
                targetBlank,
                variant,
                icon
              }
            : b
        );
      } else {
        const newBtn: CustomHeaderButton = {
          id: `btn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          label: label.trim(),
          url: formattedUrl,
          targetBlank,
          variant,
          icon
        };
        updated = [...currentButtons, newBtn];
      }

      // Persiste no Firestore e cache
      await atualizarConfiguracoes({ botoesCabecalho: updated });
      safeStorage.setItem(storageKey, JSON.stringify(updated));

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: editingId ? `Edição do botão "${label.trim()}" do cabeçalho` : `Novo botão "${label.trim()}" criado para o cabeçalho`,
        detalhes: `URL: ${formattedUrl} | Estilo: ${variant} | Alvo: ${targetBlank ? 'Nova Aba' : 'Mesma Aba'}`,
        entidade: 'Configurações de Cabeçalho'
      });

      showToast({
        type: 'success',
        title: 'Botões do Cabeçalho Atualizados',
        message: editingId ? 'Botão alterado com sucesso!' : 'Novo botão adicionado com sucesso!'
      });

      setIsFormOpen(false);
      setEditingId(null);
    } catch (_err) {
      setFormError('Falha ao salvar as configurações no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, btnLabel: string) => {
    if (!window.confirm(`Deseja realmente remover o botão "${btnLabel}" do cabeçalho?`)) {
      return;
    }

    try {
      const updated = currentButtons.filter((b) => b.id !== id);
      await atualizarConfiguracoes({ botoesCabecalho: updated });
      safeStorage.setItem(storageKey, JSON.stringify(updated));

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: `Remoção do botão "${btnLabel}" do cabeçalho`,
        detalhes: `Botão excluído das opções rápidas da campanha.`,
        entidade: 'Configurações de Cabeçalho'
      });

      showToast({
        type: 'info',
        title: 'Botão Removido',
        message: `O botão "${btnLabel}" foi removido do cabeçalho.`
      });
    } catch (_err) {
      showToast({
        type: 'error',
        title: 'Erro ao remover',
        message: 'Não foi possível excluir o botão do cabeçalho.'
      });
    }
  };

  // Helper para renderizar ícones
  const renderIcon = (iconType?: string, className: string = 'w-4 h-4') => {
    switch (iconType) {
      case 'user':
        return <UserPlus className={className} />;
      case 'chat':
        return <MessageCircle className={className} />;
      case 'file':
        return <FileText className={className} />;
      case 'globe':
        return <Globe className={className} />;
      case 'star':
        return <Star className={className} />;
      case 'external':
        return <ExternalLink className={className} />;
      default:
        return <Link2 className={className} />;
    }
  };

  // Helper para estilo
  const getVariantClasses = (varType?: string) => {
    switch (varType) {
      case 'secondary':
        return 'bg-secondary text-on-secondary hover:brightness-110 shadow-xs';
      case 'outline':
        return 'bg-surface hover:bg-surface-container border border-outline-variant text-on-surface';
      case 'surface':
        return 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/50';
      case 'primary':
      default:
        return 'bg-primary text-on-primary hover:bg-secondary shadow-xs';
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 shadow-sm space-y-5">
      {/* Header do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              Botões de Ação do Cabeçalho
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-extrabold uppercase">
                Exclusivo Administrador
              </span>
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Configure botões rápidos personalizados que aparecem no cabeçalho superior do sistema.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-secondary text-on-primary text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar Novo Botão</span>
        </button>
      </div>

      {/* Formulário de Adicionar / Editar */}
      {isFormOpen && (
        <form
          onSubmit={handleSaveButton}
          className="p-5 bg-surface-container-low rounded-xl border border-primary/30 space-y-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
            <span className="text-xs font-bold text-on-surface flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {editingId ? 'Editar Botão do Cabeçalho' : 'Cadastrar Novo Botão no Cabeçalho'}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingId(null);
              }}
              className="text-on-surface-variant hover:text-on-surface text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          {formError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 uppercase tracking-wider">
                Nome do Botão <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: WhatsApp Campanha, Consulta TSE, Painel de Metas..."
                className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 uppercase tracking-wider">
                Link de Direcionamento <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Ex: /eleitores, /locais ou https://wa.me/558699999999"
                className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono"
                required
              />
              <span className="text-[10px] text-on-surface-variant mt-1 block">
                Aceita rotas internas (ex: <code className="font-mono">/eleitores</code>) ou links externos completos.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 uppercase tracking-wider">
                Estilo Visual do Botão
              </label>
              <select
                value={variant}
                onChange={(e: any) => setVariant(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-xs text-on-surface outline-none cursor-pointer"
              >
                <option value="primary">Primário (Azul Principal)</option>
                <option value="secondary">Secundário (Destaque)</option>
                <option value="surface">Superfície (Suave / Neutro)</option>
                <option value="outline">Contorno (Outline)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 uppercase tracking-wider">
                Ícone do Botão
              </label>
              <select
                value={icon}
                onChange={(e: any) => setIcon(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-xs text-on-surface outline-none cursor-pointer"
              >
                <option value="link">Link Padrão</option>
                <option value="user">Usuário / Cadastro</option>
                <option value="chat">Conversa / WhatsApp</option>
                <option value="globe">Globo / Internet</option>
                <option value="file">Documento / Relatório</option>
                <option value="star">Estrela / Favorito</option>
                <option value="external">Link Externo</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="mgr-chk-target-blank"
              checked={targetBlank}
              onChange={(e) => setTargetBlank(e.target.checked)}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
            />
            <label htmlFor="mgr-chk-target-blank" className="text-xs text-on-surface font-medium cursor-pointer">
              Abrir em nova aba do navegador (<code className="text-[10px] font-mono">target=&quot;_blank&quot;</code>)
            </label>
          </div>

          {/* Pré-visualização do botão */}
          <div className="p-3 bg-surface rounded-lg border border-outline-variant/40 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-on-surface-variant">Pré-visualização:</span>
            <div className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold ${getVariantClasses(variant)}`}>
              {renderIcon(icon)}
              <span>{label || 'Texto do Botão'}</span>
              {(targetBlank || url.startsWith('http')) && <ArrowUpRight className="w-3 h-3 opacity-70" />}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingId(null);
              }}
              className="px-4 py-2 rounded-lg border border-outline-variant hover:bg-surface-container text-xs font-semibold text-on-surface transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-secondary text-on-primary text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Gravando...' : editingId ? 'Salvar Alteração' : 'Criar Botão'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Lista de Botões Ativos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold">
          <span>Botões Atualmente Visíveis no Cabeçalho ({currentButtons.length})</span>
          <span className="text-[11px]">Posição: Barra Superior</span>
        </div>

        {currentButtons.length === 0 ? (
          <div className="p-8 text-center bg-surface-container-low rounded-xl border border-dashed border-outline-variant">
            <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 text-outline" />
            <p className="text-xs font-bold text-on-surface">Nenhum botão configurável ativo no momento</p>
            <p className="text-[11px] text-on-surface-variant mt-1 max-w-md mx-auto">
              Ao adicionar um botão aqui, ele aparecerá imediatamente no cabeçalho superior de todos os usuários da campanha.
            </p>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-secondary text-on-primary text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Primeiro Botão</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentButtons.map((btn) => (
              <div
                key={btn.id}
                className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex items-center justify-between gap-3 hover:border-primary/40 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2.5 rounded-lg shrink-0 ${getVariantClasses(btn.variant)}`}>
                    {renderIcon(btn.icon, 'w-4 h-4')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate">
                      {btn.label}
                    </p>
                    <p className="text-[11px] font-mono text-on-surface-variant truncate">
                      {btn.url}
                    </p>
                    {btn.targetBlank && (
                      <span className="inline-block mt-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
                        Nova Aba
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(btn)}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                    title="Editar botão"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(btn.id, btn.label)}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Excluir botão"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

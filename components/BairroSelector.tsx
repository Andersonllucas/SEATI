'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, ChevronDown, Check, Plus, X } from 'lucide-react';

interface BairroSelectorProps {
  value: string;
  onChange: (value: string) => void;
  bairrosList: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function BairroSelector({
  value,
  onChange,
  bairrosList,
  placeholder = 'Selecione ou digite o bairro...',
  className = '',
  id,
  required = false,
  disabled = false,
  size = 'md',
  onKeyDown
}: BairroSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Mantém searchTerm sincronizado quando value muda externamente
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Filtra bairros com base no termo digitado
  const filteredBairros = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return bairrosList;
    return bairrosList.filter((b) => b.toLowerCase().includes(term));
  }, [bairrosList, searchTerm]);

  const exactMatchExists = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return bairrosList.some((b) => b.toLowerCase() === term);
  }, [bairrosList, searchTerm]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Ao sair, confirma o que foi digitado
        if (searchTerm.trim() !== (value || '').trim()) {
          onChange(searchTerm.trim());
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchTerm, value, onChange]);

  const handleSelect = (selectedBairro: string) => {
    onChange(selectedBairro);
    setSearchTerm(selectedBairro);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onChange(val);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((prev) => {
        const total = filteredBairros.length + (!exactMatchExists && searchTerm.trim() ? 1 : 0);
        if (total === 0) return -1;
        return (prev + 1) % total;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightedIndex((prev) => {
        const total = filteredBairros.length + (!exactMatchExists && searchTerm.trim() ? 1 : 0);
        if (total === 0) return -1;
        return (prev - 1 + total) % total;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen) {
        e.preventDefault();
        const totalFiltered = filteredBairros.length;
        if (highlightedIndex >= 0 && highlightedIndex < totalFiltered) {
          handleSelect(filteredBairros[highlightedIndex]);
          return;
        } else if (highlightedIndex === totalFiltered && searchTerm.trim()) {
          // Opção de criar novo
          handleSelect(searchTerm.trim());
          return;
        } else if (totalFiltered > 0) {
          // Seleciona o primeiro por padrão
          handleSelect(filteredBairros[0]);
          return;
        } else if (searchTerm.trim()) {
          handleSelect(searchTerm.trim());
          return;
        }
      }
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'Tab') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredBairros.length) {
        handleSelect(filteredBairros[highlightedIndex]);
      } else if (searchTerm.trim() !== (value || '').trim()) {
        onChange(searchTerm.trim());
      }
      setIsOpen(false);
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  // Altura baseada no size
  const heightClass = size === 'sm' ? 'h-9 text-xs' : size === 'lg' ? 'h-11 text-xs sm:text-sm' : 'h-10 text-sm';

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          className={`w-full ${heightClass} pl-3 pr-16 border rounded-md outline-none transition-all placeholder:text-outline/70 ${className}`}
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {searchTerm && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                setSearchTerm('');
                onChange('');
                inputRef.current?.focus();
              }}
              className="p-1 text-on-surface-variant/60 hover:text-on-surface rounded-full transition-colors cursor-pointer"
              title="Limpar bairro"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }
            }}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md transition-colors cursor-pointer"
            title="Abrir opções de bairro"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-secondary' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Floating Dropdown List */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant/80 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <ul
            ref={listRef}
            className="max-h-56 overflow-y-auto custom-scrollbar p-1 divide-y divide-outline-variant/20 text-left"
          >
            {/* Opção de adicionar o que foi digitado se não existir exatamente */}
            {searchTerm.trim() && !exactMatchExists && (
              <li>
                <button
                  type="button"
                  onClick={() => handleSelect(searchTerm.trim())}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-secondary hover:bg-secondary/10 transition-colors cursor-pointer ${
                    highlightedIndex === filteredBairros.length ? 'bg-secondary/10 text-secondary' : ''
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-secondary shrink-0" />
                  <span className="truncate">
                    Usar novo bairro: <strong className="underline">&quot;{searchTerm.trim()}&quot;</strong>
                  </span>
                </button>
              </li>
            )}

            {filteredBairros.length === 0 && !searchTerm.trim() && (
              <li className="px-3 py-3 text-center text-xs text-on-surface-variant">
                Nenhum bairro cadastrado no sistema ainda. Digite o nome do bairro acima.
              </li>
            )}

            {filteredBairros.length === 0 && searchTerm.trim() && exactMatchExists && (
              <li className="px-3 py-2.5 text-center text-xs text-on-surface-variant">
                Nenhum outro bairro corresponde à busca.
              </li>
            )}

            {filteredBairros.map((b, index) => {
              const isSelected = (value || '').trim().toLowerCase() === b.toLowerCase();
              const isHighlighted = highlightedIndex === index;

              return (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => handleSelect(b)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-secondary/10 text-secondary font-bold'
                        : isHighlighted
                        ? 'bg-surface-container text-on-surface font-medium'
                        : 'text-on-surface hover:bg-surface-container font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-secondary' : 'text-outline'}`} />
                      <span className="truncate">{b}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-secondary shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

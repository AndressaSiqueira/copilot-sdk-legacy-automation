/**
 * types.ts — Definições de tipos centrais do Enterprise Orchestrator
 * 
 * Este módulo define as interfaces TypeScript que representam:
 * - DomElement: Elementos interativos extraídos do DOM do browser
 * - DomSchema: Estrutura completa de uma página mapeada
 * - Action: Ações atômicas executáveis (click, type, etc.)
 * - ActionPlan: Plano de execução gerado pela IA
 * 
 * Estes tipos são compartilhados entre todos os módulos da extensão.
 * @module types
 */

/** Elemento interativo extraído do DOM (input, button, select, textarea) */
export interface DomElement {
  type: 'input' | 'button' | 'select' | 'textarea';
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  selector: string; // CSS selector único
  options?: string[]; // Apenas para <select>
  inputType?: string; // text, password, email, etc.
}

/** Esquema semântico completo de uma página */
export interface DomSchema {
  url: string;
  title: string;
  elements: DomElement[];
  extractedAt: string;
}

/** Uma ação atômica a ser executada no DOM */
export interface Action {
  type: 'click' | 'type' | 'select' | 'clear' | 'submit';
  selector: string;
  value?: string;
  description: string;
}

/** Plano de execução gerado pela IA — deve ser validado antes de executar */
export interface ActionPlan {
  intent: string;
  actions: Action[];
  validated: boolean;
  generatedAt: string;
}

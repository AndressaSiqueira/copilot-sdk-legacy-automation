/**
 * CopilotCore - Motor principal usando GitHub Copilot SDK
 * 
 * Este módulo é o coração da aplicação CLI. Usa o Copilot SDK para:
 * - Criar sessões de chat com o Copilot
 * - Definir tools para automação browser/desktop
 * - Processar linguagem natural e gerar planos de ação
 */

import { BrowserBridge } from './bridges/browserBridge.js';
import { DesktopBridge } from './bridges/desktopBridge.js';
import type { Action } from './types.js';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDK = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDKClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDKSession = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDKTool = any;

export interface TaskResult {
    success: boolean;
    message: string;
    actions?: Array<{
        description: string;
        success: boolean;
        error?: string;
    }>;
    rawResponse?: string;
}

export interface StatusResult {
    browser: string;
    desktop: string;
    sdk: string;
}

/**
 * Motor principal que orquestra o Copilot SDK com os bridges
 */
export class CopilotCore {
    private sdk: SDK = null;
    private client: SDKClient = null;
    private session: SDKSession = null;
    private browserBridge: BrowserBridge;
    private desktopBridge: DesktopBridge;
    private tools: SDKTool[] = [];

    constructor(browserBridge: BrowserBridge, desktopBridge: DesktopBridge) {
        this.browserBridge = browserBridge;
        this.desktopBridge = desktopBridge;
    }

    /**
     * Carrega o SDK dinamicamente (ESM) e inicializa o cliente
     */
    async initialize(): Promise<void> {
        // Carrega SDK via dynamic import (ESM)
        this.sdk = await import('@github/copilot-sdk');
        
        // Cria tools para automação
        this.tools = this.createTools();
        
        // Inicializa cliente Copilot
        this.client = new this.sdk.CopilotClient({ 
            logLevel: 'debug'  // Debug para ver tool calls
        });
        
        await this.client.start();
        
        // Usa o helper approveAll do SDK para aprovar automaticamente
        const { approveAll } = this.sdk;
        
        // Cria sessão com tools registrados e aprovação automática de permissões
        this.session = await this.client.createSession({
            tools: this.tools,
            systemMessage: {
                mode: 'append',
                content: this.getSystemPrompt()
            },
            // Aprova todas as permissões automaticamente (shell, write, read, custom-tool, etc.)
            onPermissionRequest: approveAll
        });
    }

    /**
     * Cria as tools disponíveis para o Copilot usar
     */
    private createTools(): SDKTool[] {
        if (!this.sdk) throw new Error('SDK não carregado');
        
        const { defineTool } = this.sdk;

        // Tool: Clicar em elemento
        const clickTool = defineTool('browser_click', {
            description: 'Clica em um elemento no browser. Use o seletor CSS do elemento.',
            parameters: z.object({
                selector: z.string().describe('Seletor CSS do elemento (ex: #btn-submit, .btn-primary)'),
                description: z.string().describe('Descrição do que está sendo clicado')
            }),
            handler: async (params: { selector: string; description: string }) => {
                const action: Action = {
                    type: 'click',
                    selector: params.selector,
                    description: params.description
                };
                return await this.browserBridge.executeAction(action);
            }
        });

        // Tool: Digitar texto
        const typeTool = defineTool('browser_type', {
            description: 'Digita texto em um campo de input no browser.',
            parameters: z.object({
                selector: z.string().describe('Seletor CSS do campo de input'),
                value: z.string().describe('Texto a ser digitado'),
                description: z.string().describe('Descrição do que está sendo preenchido')
            }),
            handler: async (params: { selector: string; value: string; description: string }) => {
                const action: Action = {
                    type: 'type',
                    selector: params.selector,
                    value: params.value,
                    description: params.description
                };
                return await this.browserBridge.executeAction(action);
            }
        });

        // Tool: Selecionar opção
        const selectTool = defineTool('browser_select', {
            description: 'Seleciona uma opção em um dropdown/select no browser.',
            parameters: z.object({
                selector: z.string().describe('Seletor CSS do elemento select'),
                value: z.string().describe('Valor da opção a ser selecionada'),
                description: z.string().describe('Descrição da seleção')
            }),
            handler: async (params: { selector: string; value: string; description: string }) => {
                const action: Action = {
                    type: 'select',
                    selector: params.selector,
                    value: params.value,
                    description: params.description
                };
                return await this.browserBridge.executeAction(action);
            }
        });

        // Tool: Obter DOM mapeado
        const getDomTool = defineTool('browser_get_dom', {
            description: 'Obtém a lista de elementos interativos da página atual do browser.',
            parameters: z.object({}),
            handler: async () => {
                const elements = this.browserBridge.getDomMap();
                if (elements.length === 0) {
                    return { 
                        success: false, 
                        error: 'Nenhum elemento mapeado. O browser precisa estar conectado.' 
                    };
                }
                return { 
                    success: true, 
                    elements: elements.map(el => ({
                        index: el.index,
                        tag: el.tag,
                        selector: el.selector,
                        label: el.label,
                        placeholder: el.placeholder,
                        type: el.type
                    }))
                };
            }
        });

        // Tool: Executar ação no desktop
        const desktopTool = defineTool('desktop_action', {
            description: 'Executa uma ação em aplicativo desktop nativo (Windows). Pode clicar, digitar, abrir apps.',
            parameters: z.object({
                action: z.enum(['click', 'type', 'open_app', 'key_press']).describe('Tipo de ação'),
                target: z.string().describe('Nome do app ou coordenadas (x,y) ou texto'),
                value: z.string().optional().describe('Valor adicional (texto para digitar, tecla para pressionar)')
            }),
            handler: async (params: { action: 'click' | 'type' | 'open_app' | 'key_press'; target: string; value?: string }) => {
                return await this.desktopBridge.executeAction({
                    type: params.action,
                    target: params.target,
                    value: params.value
                });
            }
        });

        // Tool: Status das conexões
        const statusTool = defineTool('get_status', {
            description: 'Retorna o status das conexões com browser e desktop.',
            parameters: z.object({}),
            handler: async () => {
                return {
                    browser: this.browserBridge.getStatus(),
                    desktop: this.desktopBridge.getStatus()
                };
            }
        });

        return [clickTool, typeTool, selectTool, getDomTool, desktopTool, statusTool];
    }

    /**
     * System prompt que define o comportamento do agente
     */
    private getSystemPrompt(): string {
        return `Você é o Legacy Agent, um assistente especializado em automação de interfaces.

Seu papel é:
1. Interpretar comandos em linguagem natural do usuário
2. Usar as tools disponíveis para executar ações no browser ou desktop
3. Reportar o resultado de forma clara

## Fluxo de trabalho:
1. Use 'browser_get_dom' para ver os elementos disponíveis na página
2. Identifique os elementos corretos baseado na tarefa do usuário
3. Execute as ações necessárias usando as tools browser_click, browser_type, browser_select
4. Para ações em desktop, use desktop_action

## Regras:
- Sempre verifique primeiro quais elementos estão disponíveis antes de agir
- Use seletores CSS precisos (#id, .class, [name="campo"])
- Explique o que está fazendo em cada passo
- Se algo falhar, tente uma abordagem alternativa

## Capacidades:
- Browser: clicar, digitar, selecionar em dropdowns, ler valores
- Desktop: abrir aplicativos, clicar, digitar, pressionar teclas

Responda sempre em português brasileiro.`;
    }

    /**
     * Executa uma tarefa usando o Copilot SDK
     */
    async executeTask(task: string): Promise<TaskResult> {
        if (!this.session) {
            return {
                success: false,
                message: 'SDK não inicializado. Execute initialize() primeiro.'
            };
        }

        try {
            // Envia mensagem para o Copilot e espera resposta
            const response = await this.session.sendAndWait({ prompt: task });
            
            // Extrai conteúdo da resposta
            const content = response?.data?.content || 'Sem resposta';
            
            return {
                success: true,
                message: content,
                actions: undefined,
                rawResponse: content
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro desconhecido',
                actions: []
            };
        }
    }

    /**
     * Retorna status das conexões
     */
    async getStatus(): Promise<StatusResult> {
        return {
            browser: this.browserBridge.getStatus(),
            desktop: this.desktopBridge.getStatus(),
            sdk: this.client ? 'connected' : 'disconnected'
        };
    }

    /**
     * Encerra o cliente e a sessão
     */
    async shutdown(): Promise<void> {
        this.session?.close();
        await this.client?.stop();
        this.browserBridge.stop();
        this.desktopBridge.stop();
    }
}

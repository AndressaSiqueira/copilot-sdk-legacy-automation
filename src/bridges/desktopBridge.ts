/**
 * DesktopBridge - Comunicação com o Desktop Agent Python
 * 
 * Conecta via WebSocket ao agente Python que controla
 * aplicativos nativos do Windows (notepad, calc, etc.)
 */

import { WebSocket } from 'ws';

export interface DesktopAction {
    type: 'click' | 'type' | 'open_app' | 'key_press';
    target: string;
    value?: string;
}

export interface DesktopResult {
    success: boolean;
    action: string;
    error?: string;
}

interface BridgeMessage {
    type: string;
    payload?: unknown;
}

export class DesktopBridge {
    private client: WebSocket | null = null;
    private status: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
    private readonly port: number;
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(port = 7338) {
        this.port = port;
    }

    /**
     * Inicia a conexão com o Desktop Agent
     */
    async start(): Promise<void> {
        return this.connect();
    }

    /**
     * Conecta ao Desktop Agent Python
     */
    private connect(): Promise<void> {
        return new Promise((resolve) => {
            this.status = 'connecting';
            
            try {
                this.client = new WebSocket(`ws://localhost:${this.port}`);

                this.client.on('open', () => {
                    this.status = 'connected';
                    console.log(`   ✅ Desktop Agent conectado na porta ${this.port}`);
                    resolve();
                });

                this.client.on('error', () => {
                    // Desktop agent pode não estar rodando - isso é ok
                    this.status = 'disconnected';
                    console.log(`   ⚠️  Desktop Agent não disponível (porta ${this.port})`);
                    console.log(`      Execute: python desktop_agent.py`);
                    resolve(); // Não falha, apenas não conecta
                });

                this.client.on('close', () => {
                    this.status = 'disconnected';
                    this.client = null;
                    // Tenta reconectar após 5 segundos
                    this.scheduleReconnect();
                });

                // Timeout de conexão
                setTimeout(() => {
                    if (this.status === 'connecting') {
                        this.status = 'disconnected';
                        console.log(`   ⚠️  Desktop Agent timeout (porta ${this.port})`);
                        resolve();
                    }
                }, 3000);
                
            } catch {
                this.status = 'disconnected';
                resolve();
            }
        });
    }

    /**
     * Agenda reconexão automática
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.status === 'disconnected') {
                this.connect().catch(() => {});
            }
        }, 5000);
    }

    /**
     * Para a conexão
     */
    stop(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.client?.close();
        this.client = null;
        this.status = 'disconnected';
    }

    /**
     * Retorna status da conexão
     */
    getStatus(): string {
        return this.status;
    }

    /**
     * Executa uma ação no desktop
     */
    async executeAction(action: DesktopAction): Promise<DesktopResult> {
        if (!this.client || this.status !== 'connected') {
            return {
                success: false,
                action: action.type,
                error: 'Desktop Agent não conectado. Execute: python desktop_agent.py'
            };
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    success: false,
                    action: action.type,
                    error: 'Timeout - Desktop Agent não respondeu'
                });
            }, 30000); // 30s timeout para ações desktop (podem ser lentas)

            const handler = (data: WebSocket.RawData) => {
                try {
                    const msg: BridgeMessage = JSON.parse(data.toString());
                    if (msg.type === 'action_result') {
                        clearTimeout(timeout);
                        this.client?.off('message', handler);
                        resolve(msg.payload as DesktopResult);
                    }
                } catch {
                    // Ignorar
                }
            };

            this.client?.on('message', handler);

            // Converte ação para formato do Desktop Agent
            const desktopCommand = this.formatCommand(action);
            this.client?.send(JSON.stringify({
                type: 'desktop_command',
                payload: desktopCommand
            }));
        });
    }

    /**
     * Formata comando para o Desktop Agent Python
     */
    private formatCommand(action: DesktopAction): object {
        switch (action.type) {
            case 'open_app':
                return {
                    action: 'open_application',
                    app_name: action.target
                };
            case 'click':
                // Aceita coordenadas "x,y" ou nome de elemento
                if (action.target.includes(',')) {
                    const [x, y] = action.target.split(',').map(Number);
                    return { action: 'click', x, y };
                }
                return { action: 'click_element', element: action.target };
            case 'type':
                return {
                    action: 'type_text',
                    text: action.value || action.target
                };
            case 'key_press':
                return {
                    action: 'key_press',
                    key: action.value || action.target
                };
            default:
                return { action: action.type, ...action };
        }
    }

    /**
     * Atalho para abrir um aplicativo
     */
    async openApp(appName: string): Promise<DesktopResult> {
        return this.executeAction({
            type: 'open_app',
            target: appName
        });
    }

    /**
     * Atalho para digitar texto
     */
    async typeText(text: string): Promise<DesktopResult> {
        return this.executeAction({
            type: 'type',
            target: text,
            value: text
        });
    }

    /**
     * Atalho para pressionar tecla
     */
    async pressKey(key: string): Promise<DesktopResult> {
        return this.executeAction({
            type: 'key_press',
            target: key,
            value: key
        });
    }
}

/**
 * BrowserBridge - Comunicação WebSocket com o browser
 * 
 * Servidor WebSocket que permite automação de páginas web.
 * O browser se conecta via content-script e recebe comandos.
 */

import { WebSocketServer, WebSocket as WS, RawData } from 'ws';
import type { Action } from '../types.js';

export interface DomElement {
    index: number;
    tag: string;
    selector: string;
    id: string;
    name: string;
    type: string;
    className: string;
    placeholder: string;
    label: string;
    value: string;
}

export interface ActionResult {
    success: boolean;
    selector: string;
    error?: string;
}

interface BridgeMessage {
    type: string;
    payload?: unknown;
}

export class BrowserBridge {
    private server: WebSocketServer | null = null;
    private client: WS | null = null;
    private domMap: DomElement[] = [];
    private status: 'disconnected' | 'listening' | 'connected' = 'disconnected';
    private readonly port: number;

    constructor(port = 7337) {
        this.port = port;
    }

    /**
     * Inicia o servidor WebSocket
     */
    async start(): Promise<void> {
        if (this.server) return;

        return new Promise((resolve, reject) => {
            this.server = new WebSocketServer({ port: this.port });

            this.server.on('listening', () => {
                this.status = 'listening';
                console.log(`   ✅ Browser Bridge escutando na porta ${this.port}`);
                resolve();
            });

            this.server.on('error', (err) => {
                if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
                    console.log(`   ⚠️  Porta ${this.port} em uso, tentando próxima...`);
                    this.server = null;
                    // Tenta próxima porta
                    this.port === 7337 ? resolve() : reject(err);
                } else {
                    reject(err);
                }
            });

            this.server.on('connection', (ws) => {
                this.client = ws;
                this.status = 'connected';
                console.log(`   🌐 Browser conectado!`);

                ws.on('message', (data) => {
                    try {
                        const msg: BridgeMessage = JSON.parse(data.toString());
                        this.handleMessage(msg);
                    } catch {
                        // Ignorar mensagens inválidas
                    }
                });

                ws.on('close', () => {
                    this.client = null;
                    this.status = 'listening';
                    console.log(`   🔌 Browser desconectado`);
                });
            });
        });
    }

    /**
     * Processa mensagens do browser
     */
    private handleMessage(msg: BridgeMessage): void {
        switch (msg.type) {
            case 'DOM_READY':
                this.domMap = msg.payload as DomElement[];
                console.log(`   📄 DOM mapeado: ${this.domMap.length} elementos`);
                break;
            case 'ping':
                this.client?.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }

    /**
     * Para o servidor
     */
    stop(): void {
        this.client?.close();
        this.server?.close();
        this.server = null;
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
     * Retorna elementos DOM mapeados
     */
    getDomMap(): DomElement[] {
        return this.domMap;
    }

    /**
     * Executa uma ação no browser
     */
    async executeAction(action: Action): Promise<ActionResult> {
        if (!this.client || this.status !== 'connected') {
            return {
                success: false,
                selector: action.selector,
                error: 'Browser não conectado'
            };
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    success: false,
                    selector: action.selector,
                    error: 'Timeout - browser não respondeu'
                });
            }, 10000);

            const handler = (data: RawData) => {
                try {
                    const msg: BridgeMessage = JSON.parse(data.toString());
                    if (msg.type === 'action_result') {
                        clearTimeout(timeout);
                        this.client?.off('message', handler);
                        resolve(msg.payload as ActionResult);
                    }
                } catch {
                    // Ignorar
                }
            };

            this.client?.on('message', handler);
            
            this.client?.send(JSON.stringify({
                type: 'action',
                payload: action
            }));
        });
    }

    /**
     * Executa múltiplas ações em sequência
     */
    async executePlan(actions: Action[]): Promise<ActionResult[]> {
        const results: ActionResult[] = [];
        
        for (const action of actions) {
            const result = await this.executeAction(action);
            results.push(result);
            
            if (!result.success) {
                break; // Para na primeira falha
            }
        }
        
        return results;
    }
}

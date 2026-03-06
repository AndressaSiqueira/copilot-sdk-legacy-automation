#!/usr/bin/env node
/**
 * CLI Principal - Legacy Agent
 * 
 * Usa GitHub Copilot SDK como motor de IA para automação
 * de interfaces legadas (browser e desktop)
 * 
 * Uso:
 *   npx legacy-agent "preencher formulário com nome João"
 *   npx legacy-agent --interactive
 *   npx legacy-agent --server (modo API REST)
 */

import { CopilotCore } from './copilotCore.js';
import { BrowserBridge } from './bridges/browserBridge.js';
import { DesktopBridge } from './bridges/desktopBridge.js';
import * as readline from 'readline';

interface CLIOptions {
    interactive: boolean;
    server: boolean;
    port: number;
    task?: string;
}

function parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = {
        interactive: false,
        server: false,
        port: 7339
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--interactive' || arg === '-i') {
            options.interactive = true;
        } else if (arg === '--server' || arg === '-s') {
            options.server = true;
        } else if (arg === '--port' || arg === '-p') {
            options.port = parseInt(args[++i]) || 7339;
        } else if (!arg.startsWith('-')) {
            options.task = arg;
        }
    }

    return options;
}

function printBanner(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🤖 Legacy Agent - Copilot SDK                   ║
║     Automação de interfaces legadas com IA                ║
╠═══════════════════════════════════════════════════════════╣
║  Comandos:                                                ║
║    --interactive, -i    Modo interativo (chat)            ║
║    --server, -s         Inicia servidor REST API          ║
║    --port, -p <num>     Porta do servidor (default: 7339) ║
║    "tarefa"             Executa tarefa diretamente        ║
╚═══════════════════════════════════════════════════════════╝
`);
}

async function runInteractive(core: CopilotCore): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n📝 Modo interativo. Digite sua tarefa ou "sair" para encerrar.\n');
    console.log('Exemplos:');
    console.log('  > preencher formulário com nome João Silva');
    console.log('  > clicar no botão Enviar');
    console.log('  > abrir notepad e digitar Hello World\n');

    const prompt = (): void => {
        rl.question('🤖 > ', async (input) => {
            const trimmed = input.trim().toLowerCase();
            
            if (trimmed === 'sair' || trimmed === 'exit' || trimmed === 'quit') {
                console.log('\n👋 Até logo!\n');
                rl.close();
                process.exit(0);
            }

            if (trimmed === 'status') {
                const status = await core.getStatus();
                console.log('\n📊 Status:');
                console.log(`   Browser: ${status.browser}`);
                console.log(`   Desktop: ${status.desktop}`);
                console.log(`   SDK: ${status.sdk}\n`);
                prompt();
                return;
            }

            if (trimmed === 'help') {
                console.log('\n📖 Comandos disponíveis:');
                console.log('   status  - Mostra status das conexões');
                console.log('   sair    - Encerra o agente');
                console.log('   <task>  - Executa tarefa com IA\n');
                prompt();
                return;
            }

            if (!input.trim()) {
                prompt();
                return;
            }

            try {
                console.log('\n⏳ Processando...\n');
                const result = await core.executeTask(input);
                console.log('\n✅ Resultado:');
                console.log(result.message);
                if (result.actions && result.actions.length > 0) {
                    console.log('\n📋 Ações executadas:');
                    result.actions.forEach((action, i) => {
                        const icon = action.success ? '✓' : '✗';
                        console.log(`   ${i + 1}. [${icon}] ${action.description}`);
                    });
                }
                console.log('');
            } catch (error) {
                console.error('\n❌ Erro:', error instanceof Error ? error.message : error);
                console.log('');
            }

            prompt();
        });
    };

    prompt();
}

async function runSingleTask(core: CopilotCore, task: string): Promise<void> {
    console.log(`\n⏳ Executando: "${task}"\n`);
    
    try {
        const result = await core.executeTask(task);
        console.log('✅ Resultado:', result.message);
        
        if (result.actions && result.actions.length > 0) {
            console.log('\n📋 Ações:');
            result.actions.forEach((action, i) => {
                const icon = action.success ? '✓' : '✗';
                console.log(`   ${i + 1}. [${icon}] ${action.description}`);
            });
        }
        
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('❌ Erro:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

async function runServer(core: CopilotCore, port: number): Promise<void> {
    // Importa http dinamicamente para não poluir o bundle se não usado
    const http = await import('http');
    
    const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || '/', `http://localhost:${port}`);
        
        // GET /status
        if (req.method === 'GET' && url.pathname === '/status') {
            const status = await core.getStatus();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
            return;
        }

        // POST /execute
        if (req.method === 'POST' && url.pathname === '/execute') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { task } = JSON.parse(body);
                    if (!task) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Campo "task" é obrigatório' }));
                        return;
                    }
                    
                    console.log(`📥 Request: "${task}"`);
                    const result = await core.executeTask(task);
                    console.log(`📤 Response: ${result.success ? 'OK' : 'ERRO'}`);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: error instanceof Error ? error.message : 'Erro interno' 
                    }));
                }
            });
            return;
        }

        // GET /health
        if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
    });

    server.listen(port, () => {
        console.log(`\n🚀 Servidor REST iniciado na porta ${port}`);
        console.log(`\n📡 Endpoints disponíveis:`);
        console.log(`   GET  http://localhost:${port}/health  - Health check`);
        console.log(`   GET  http://localhost:${port}/status  - Status das conexões`);
        console.log(`   POST http://localhost:${port}/execute - Executar tarefa`);
        console.log(`\n💡 Exemplo de uso:`);
        console.log(`   curl -X POST http://localhost:${port}/execute \\`);
        console.log(`        -H "Content-Type: application/json" \\`);
        console.log(`        -d '{"task": "preencher nome com João"}'`);
        console.log(`\n⏳ Aguardando requisições...\n`);
    });
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // Se nenhuma opção, mostra ajuda
    if (!options.interactive && !options.server && !options.task) {
        printBanner();
        console.log('💡 Use --interactive para modo chat ou passe uma tarefa diretamente.\n');
        process.exit(0);
    }

    printBanner();
    
    console.log('🔄 Inicializando Copilot SDK...');
    
    // Inicializa o core
    const browserBridge = new BrowserBridge();
    const desktopBridge = new DesktopBridge();
    const core = new CopilotCore(browserBridge, desktopBridge);
    
    try {
        await core.initialize();
        console.log('✅ SDK inicializado com sucesso!\n');
    } catch (error) {
        console.error('❌ Erro ao inicializar SDK:', error instanceof Error ? error.message : error);
        console.log('\n⚠️  Certifique-se de que o GitHub Copilot CLI está instalado e autenticado.');
        console.log('   Execute: gh auth login --scopes copilot\n');
        process.exit(1);
    }

    // Inicia bridges
    console.log('🔄 Iniciando bridges...');
    await browserBridge.start();
    await desktopBridge.start();
    console.log(`   Browser Bridge: porta 7337`);
    console.log(`   Desktop Bridge: porta 7338\n`);

    // Executa modo selecionado
    if (options.server) {
        await runServer(core, options.port);
    } else if (options.interactive) {
        await runInteractive(core);
    } else if (options.task) {
        await runSingleTask(core, options.task);
    }
}

// Tratamento de erros global
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não tratado:', error.message);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Encerrando...\n');
    process.exit(0);
});

main().catch(console.error);

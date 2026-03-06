# Copilot SDK Legacy Automation

🤖 CLI application for automating legacy interfaces (browser and desktop) using natural language, powered by **GitHub Copilot SDK**.

## Features

- **GitHub Copilot SDK** as the AI engine (`@github/copilot-sdk`)
- **Browser automation** via WebSocket injection
- **Desktop automation** via Python agent (Windows)
- **Three execution modes**: Interactive chat, REST API server, single task
- **Custom tools**: `browser_click`, `browser_type`, `browser_select`, `desktop_action`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI (Node.js)                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CopilotCore                            │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │         GitHub Copilot SDK                  │   │   │
│  │  │    @github/copilot-sdk@0.1.30               │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                    ▲                               │   │
│  │                    │ tools                         │   │
│  │    ┌───────────────┼───────────────┐              │   │
│  │    ▼               ▼               ▼              │   │
│  │ BrowserBridge  DesktopBridge   get_status         │   │
│  └────┬───────────────┬───────────────────────────────┘   │
│       │               │                                    │
│       │ WS:7337       │ WS:7338                           │
└───────┼───────────────┼────────────────────────────────────┘
        ▼               ▼
   ┌─────────┐    ┌──────────────┐
   │ Browser │    │ desktop_agent│
   │(content │    │   (Python)   │
   │ script) │    │  PyAutoGUI   │
   └─────────┘    └──────────────┘
```

## Requirements

- Node.js >= 18
- GitHub Copilot CLI authenticated (`gh auth login --scopes copilot`)
- Python 3.9+ (for desktop automation)

## Installation

```bash
# Clone and install
git clone https://github.com/AndressaSiqueira/copilot-sdk-legacy-automation.git
cd copilot-sdk-legacy-automation
npm install
npm run build

# For desktop automation (optional)
pip install pyautogui websockets pillow pygetwindow pywin32
```

## Usage

### Interactive Mode (Chat)

```bash
npm run start:interactive
# or
node dist/cli.js --interactive
```

### Single Task

```bash
node dist/cli.js "abrir notepad e digitar hello world"
```

### REST API Server

```bash
npm run start:server
# or
node dist/cli.js --server --port 7339
```

API endpoints:
- `GET /health` - Health check
- `GET /status` - Connection status
- `POST /execute` - Execute task `{"task": "..."}` 

## Desktop Automation

Start the Python agent in a separate terminal:

```bash
python desktop_agent.py
```

Then use natural language commands:
- "abrir notepad e digitar hello world"
- "abrir calculadora"
- "focar no bloco de notas e digitar texto"

## Browser Automation

1. Open target page in browser
2. Open DevTools Console (F12)
3. Paste and run `browser/content-script.js`
4. Use natural language commands:
   - "clicar no botão Enviar"
   - "preencher campo nome com João Silva"
   - "selecionar opção Ativo no dropdown status"

## Project Structure

```
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── copilotCore.ts      # Copilot SDK engine + tools
│   ├── types.ts            # TypeScript interfaces
│   └── bridges/
│       ├── browserBridge.ts  # WebSocket server (port 7337)
│       ├── desktopBridge.ts  # WebSocket client (port 7338)
│       └── index.ts
├── browser/
│   └── content-script.js   # Browser injection script
├── desktop_agent.py        # Python desktop automation
├── package.json
└── tsconfig.json
```

## SDK Integration

This project uses the official **GitHub Copilot SDK** (`@github/copilot-sdk`) from npm:

```typescript
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient({ logLevel: 'debug' });
await client.start();

const session = await client.createSession({
    tools: [...],
    systemMessage: { mode: 'append', content: '...' },
    onPermissionRequest: approveAll
});

const response = await session.sendAndWait({ prompt: task });
```

## License

MIT

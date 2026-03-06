#!/usr/bin/env python3
"""
Desktop Agent — Agente Python para automação de desktop via WebSocket.
Conecta ao Enterprise Orchestrator para executar comandos no sistema operacional.

Uso:
    pip install pyautogui websockets pillow
    python desktop_agent.py

Porta padrão: 7338 (Browser Bridge usa 7337)
"""

import asyncio
import json
import subprocess
import sys
from typing import Any, Dict

try:
    import pyautogui
    import websockets
    import pygetwindow as gw
except ImportError:
    print("❌ Dependências não instaladas. Execute:")
    print("   pip install pyautogui websockets pillow pygetwindow")
    sys.exit(1)


# ── Configuração ──────────────────────────────────────────────────────────────

PORT = 7338
HOST = "localhost"

# Configurações de segurança do PyAutoGUI
pyautogui.FAILSAFE = True  # Move o mouse para o canto para cancelar
pyautogui.PAUSE = 0.3  # Pausa entre ações (reduzido para melhor responsividade)

# Importa win32 para foco de janela robusto (opcional mas recomendado)
try:
    import win32gui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
    print("⚠️ pywin32 não instalado. Foco de janela pode ser inconsistente.")
    print("   Instale com: pip install pywin32")


# ── Função de Foco de Janela (Enterprise-grade com win32) ─────────────────────

def force_focus_window(hwnd: int) -> bool:
    """
    Força o foco de uma janela usando múltiplos métodos.
    Contorna as proteções do Windows contra roubo de foco.
    """
    if not HAS_WIN32:
        return False
    
    try:
        # Método 1: Restaura se minimizada
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        
        # Método 2: Traz para frente
        win32gui.SetForegroundWindow(hwnd)
        
        # Método 3: Força ativação via AttachThreadInput (mais agressivo)
        import win32process
        import win32api
        
        foreground_hwnd = win32gui.GetForegroundWindow()
        foreground_thread = win32process.GetWindowThreadProcessId(foreground_hwnd)[0]
        target_thread = win32process.GetWindowThreadProcessId(hwnd)[0]
        
        if foreground_thread != target_thread:
            win32process.AttachThreadInput(foreground_thread, target_thread, True)
            win32gui.SetForegroundWindow(hwnd)
            win32gui.BringWindowToTop(hwnd)
            win32process.AttachThreadInput(foreground_thread, target_thread, False)
        
        return True
    except Exception as e:
        print(f"⚠️ Erro no force_focus: {e}")
        return False


def find_and_focus_window(partial_title: str) -> Dict[str, Any]:
    """
    Busca e foca uma janela pelo título parcial.
    Usa win32gui para foco robusto no Windows.
    """
    try:
        all_titles = gw.getAllTitles()
        
        # Aliases comuns para aplicativos (case-insensitive)
        aliases = {
            "bloco de notas": ["notepad", "bloco de notas", "sem título - bloco", "sem titulo"],
            "notepad": ["notepad", "bloco de notas", "sem título - bloco", "sem titulo"],
            "excel": ["excel", "microsoft excel"],
            "word": ["word", "microsoft word", "documento"],
            "chrome": ["chrome", "google chrome"],
            "edge": ["edge", "microsoft edge"],
        }
        
        # Expande o partial_title com aliases
        search_terms = [partial_title.lower()]
        for key, values in aliases.items():
            if partial_title.lower() in key or key in partial_title.lower():
                search_terms.extend(values)
        
        # Remove duplicatas
        search_terms = list(set(search_terms))
        print(f"🔍 Buscando janelas com termos: {search_terms}")
        
        # Filtra títulos vazios e encontra match parcial (case-insensitive)
        matching_windows = []
        for title in all_titles:
            if title.strip():
                for term in search_terms:
                    if term in title.lower():
                        matching_windows.append(title)
                        break
        
        if matching_windows:
            # Encontrou! Tenta ativar a primeira janela correspondente
            target_title = matching_windows[0]
            windows = gw.getWindowsWithTitle(target_title)
            
            if windows:
                win = windows[0]
                focused = False
                
                # Método 1: Tenta usar win32gui (mais confiável)
                if HAS_WIN32:
                    hwnd = win._hWnd
                    focused = force_focus_window(hwnd)
                    if focused:
                        print(f"🎯 Janela focada via win32: {target_title}")
                
                # Método 2: Fallback para pygetwindow
                if not focused:
                    try:
                        # Restaura se minimizada
                        if win.isMinimized:
                            win.restore()
                        # Ativa a janela
                        win.activate()
                        # Clica no centro da janela para garantir foco
                        import time
                        time.sleep(0.2)
                        center_x = win.left + win.width // 2
                        center_y = win.top + win.height // 2
                        pyautogui.click(center_x, center_y)
                        focused = True
                        print(f"🎯 Janela focada via pygetwindow+click: {target_title}")
                    except Exception as e:
                        print(f"⚠️ Erro no fallback: {e}")
                
                if focused:
                    # Delay de segurança para garantir que a janela está pronta
                    import time
                    time.sleep(0.5)
                    return {
                        "success": True, 
                        "message": f"Janela '{target_title}' focada com sucesso",
                        "window": target_title
                    }
        
        # Não encontrou - retorna lista dos 5 primeiros apps abertos
        open_apps = [t for t in all_titles if t.strip() and len(t) > 2][:5]
        return {
            "success": False,
            "error": f"Janela '{partial_title}' não encontrada. Abra o app primeiro.",
            "suggestions": open_apps,
            "message": f"Não encontrei '{partial_title}'. Apps abertos: {', '.join(open_apps)}"
        }
        
    except Exception as e:
        return {"success": False, "error": f"Erro ao buscar janela: {str(e)}"}


def list_open_windows() -> Dict[str, Any]:
    """Lista todas as janelas abertas no sistema."""
    try:
        all_titles = gw.getAllTitles()
        open_apps = [t for t in all_titles if t.strip() and len(t) > 2]
        return {
            "success": True,
            "windows": open_apps[:10],
            "message": f"Janelas abertas: {', '.join(open_apps[:10])}"
        }
    except Exception as e:
        return {"success": False, "error": f"Erro ao listar janelas: {str(e)}"}


# ── Handlers de Comandos ──────────────────────────────────────────────────────

async def handle_command(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Processa um comando desktop e retorna o resultado."""
    command = payload.get("command")
    target = payload.get("target", "")
    parameters = payload.get("parameters", {})
    
    # === FOCO AUTOMÁTICO DE JANELA (funciona para TODOS os comandos) ===
    # Busca targetApp diretamente do payload (enviado pelo Orchestrator) ou de parameters
    target_app = payload.get("targetApp") or parameters.get("targetApp") or parameters.get("focus_window")
    
    if target_app and command not in ["open_app", "list_windows", "focus_window"]:
        # Feedback visual antes de focar
        print(f"🔄 Focando no '{target_app}' e iniciando digitação...")
        
        focus_result = find_and_focus_window(target_app)
        if not focus_result["success"]:
            return {
                "success": False,
                "error": f"Janela '{target_app}' não encontrada. Abra o app primeiro.",
                "suggestions": focus_result.get("suggestions", []),
                "message": focus_result.get("message", ""),
                "feedback": f"❌ Não foi possível focar no '{target_app}'"
            }
        
        # Delay de segurança de 500ms para garantir que a janela está pronta
        await asyncio.sleep(0.5)
        print(f"🎯 Janela '{target_app}' focada e pronta para receber input")

    try:
        if command == "open_app":
            return await open_application(target, parameters)
        elif command == "type_text":
            return await type_text(target, parameters)
        elif command == "click_screen":
            return await click_screen(target, parameters)
        elif command == "run_command":
            return await run_shell_command(target, parameters)
        elif command == "move_mouse":
            return await move_mouse(target, parameters)
        elif command == "hotkey":
            return await press_hotkey(target, parameters)
        elif command == "screenshot":
            return await take_screenshot(target, parameters)
        elif command == "list_windows":
            return list_open_windows()
        elif command == "focus_window":
            return find_and_focus_window(target)
        else:
            return {"success": False, "error": f"Comando desconhecido: {command}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def open_application(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Abre um aplicativo pelo nome ou caminho."""
    try:
        if sys.platform == "win32":
            subprocess.Popen(["start", "", target], shell=True)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-a", target])
        else:
            subprocess.Popen([target])
        
        await asyncio.sleep(params.get("wait", 2))
        return {"success": True, "message": f"Aplicativo '{target}' iniciado"}
    except Exception as e:
        return {"success": False, "error": f"Falha ao abrir {target}: {e}"}


async def type_text(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Digita texto no foco atual. O foco da janela é gerenciado pelo handler principal."""
    interval = params.get("interval", 0.05)
    
    # Digita o texto
    if target.isascii():
        pyautogui.typewrite(target, interval=interval)
    else:
        # Para caracteres não-ASCII (acentos, etc), usa write
        pyautogui.write(target)
    
    return {"success": True, "message": f"Texto digitado: '{target[:50]}...'" if len(target) > 50 else f"Texto digitado: '{target}'"}


async def click_screen(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Clica em coordenadas da tela."""
    # target pode ser "x,y" ou uma imagem para localizar
    if "," in target:
        x, y = map(int, target.split(","))
    else:
        # Tenta localizar imagem na tela
        location = pyautogui.locateOnScreen(target, confidence=params.get("confidence", 0.9))
        if not location:
            return {"success": False, "error": f"Imagem não encontrada: {target}"}
        x, y = pyautogui.center(location)
    
    button = params.get("button", "left")
    clicks = params.get("clicks", 1)
    pyautogui.click(x, y, clicks=clicks, button=button)
    return {"success": True, "message": f"Clicado em ({x}, {y})"}


async def run_shell_command(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Executa um comando shell."""
    timeout = params.get("timeout", 30)
    capture = params.get("capture", True)
    
    result = subprocess.run(
        target,
        shell=True,
        capture_output=capture,
        text=True,
        timeout=timeout
    )
    
    return {
        "success": result.returncode == 0,
        "message": result.stdout[:1000] if capture else "Comando executado",
        "error": result.stderr[:500] if result.returncode != 0 else None,
        "returncode": result.returncode
    }


async def move_mouse(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Move o mouse para coordenadas."""
    x, y = map(int, target.split(","))
    duration = params.get("duration", 0.5)
    pyautogui.moveTo(x, y, duration=duration)
    return {"success": True, "message": f"Mouse movido para ({x}, {y})"}


async def press_hotkey(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Pressiona uma combinação de teclas."""
    keys = target.split("+")
    pyautogui.hotkey(*keys)
    return {"success": True, "message": f"Hotkey pressionada: {target}"}


async def take_screenshot(target: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Tira screenshot e salva."""
    filename = target or "screenshot.png"
    region = params.get("region")  # (x, y, width, height)
    
    if region:
        screenshot = pyautogui.screenshot(region=tuple(region))
    else:
        screenshot = pyautogui.screenshot()
    
    screenshot.save(filename)
    return {"success": True, "message": f"Screenshot salvo: {filename}"}


# ── WebSocket Server ──────────────────────────────────────────────────────────

async def handle_client(websocket):
    """Handler para cada conexão WebSocket."""
    print(f"🟢 Cliente conectado: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data.get("type") == "ping":
                    await websocket.send(json.dumps({"type": "pong", "payload": None}))
                    continue
                
                if data.get("type") == "desktop_command":
                    payload = data.get("payload", {})
                    print(f"📥 Comando: {payload.get('command')} → {payload.get('target')}")
                    
                    result = await handle_command(payload)
                    
                    await websocket.send(json.dumps({
                        "type": "desktop_result",
                        **result
                    }))
                    
                    status = "✅" if result.get("success") else "❌"
                    print(f"{status} Resultado: {result.get('message', result.get('error'))}")
            
            except json.JSONDecodeError:
                print("⚠️ Mensagem JSON inválida")
    
    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 Cliente desconectado: {websocket.remote_address}")


async def main():
    """Inicia o servidor WebSocket."""
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║           🖥️  Desktop Agent — Enterprise Orchestrator      ║
╠═══════════════════════════════════════════════════════════╣
║  Porta: {PORT}                                              ║
║  Comandos: open_app, type_text, click_screen, run_command ║
║            move_mouse, hotkey, screenshot                 ║
║                                                           ║
║  Mova o mouse para o canto superior esquerdo para PARAR   ║
╚═══════════════════════════════════════════════════════════╝
""")
    
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"🚀 Desktop Agent aguardando em ws://{HOST}:{PORT}")
        await asyncio.Future()  # Roda indefinidamente


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Desktop Agent encerrado")

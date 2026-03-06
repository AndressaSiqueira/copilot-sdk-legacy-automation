/**
 * content-script.js — Script de injeção para automação de páginas web
 * 
 * Este script é injetado diretamente no browser via DevTools Console ou Bookmarklet.
 * Ele estabelece uma conexão WebSocket com o BrowserBridge (porta 7337) e:
 * 
 * 1. Envia automaticamente o mapeamento do DOM (DOM_READY) assim que conecta
 * 2. Executa ActionPlans recebidos do VS Code (click, type, read, etc.)
 * 3. Reporta progresso em tempo real para streaming no chat
 * 4. Implementa busca semântica Enterprise-grade para elementos dinâmicos
 * 
 * Para usar:
 *   1. Abra a página legada no browser
 *   2. Abra DevTools → Console (F12)
 *   3. Cole e execute este script
 *   4. Aguarde "🟢 Conectado ao VS Code!"
 * 
 * @module content-script
 */

(function() {
    const socket = new WebSocket('ws://localhost:7337');

    // Busca resiliente de elementos - tenta fallbacks se o seletor exato falhar
    const findElement = (selector) => {
        // Tenta o seletor exato primeiro
        let el = document.querySelector(selector);
        if (el) return el;

        // Se falhar e for uma classe numérica dinâmica, tenta alternativas
        if (selector.includes('input-field')) {
            el = document.querySelector('input[type="text"]');
            if (el) return el;
        }
        
        if (selector.includes('btn') || selector.includes('button')) {
            el = document.querySelector('button') || document.querySelector('[type="submit"]');
            if (el) return el;
        }

        if (selector.includes('select')) {
            el = document.querySelector('select');
            if (el) return el;
        }

        // Tenta por ID parcial (remove números dinâmicos)
        const baseSelector = selector.replace(/-?\d+/g, '');
        if (baseSelector !== selector) {
            el = document.querySelector(`[class*="${baseSelector.replace('.', '')}"]`);
            if (el) return el;
        }

        return null;
    };

    // Espera um elemento aparecer no DOM (para sistemas lentos)
    async function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve, reject) => {
            // Tenta imediatamente
            let el = findElement(selector);
            if (el) {
                resolve(el);
                return;
            }

            const start = Date.now();
            const timer = setInterval(() => {
                el = findElement(selector);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject(new Error(`Elemento ${selector} não apareceu a tempo.`));
                }
            }, 100);
        });
    }

    // === FUNÇÃO AUXILIAR: Extrai valor de um elemento ===
    function extractValueFromElement(element) {
        if (!element) return '';
        
        // Inputs, textareas, selects
        if (element.value !== undefined && element.value !== '') {
            return element.value;
        }
        // Labels, divs, spans, paragraphs
        if (element.innerText && element.innerText.trim() !== '') {
            return element.innerText.trim();
        }
        // Fallback para textContent  
        if (element.textContent && element.textContent.trim() !== '') {
            return element.textContent.trim();
        }
        // Alguns sistemas usam data-value
        if (element.getAttribute && element.getAttribute('data-value')) {
            return element.getAttribute('data-value');
        }
        // Fallback para title
        if (element.getAttribute && element.getAttribute('title')) {
            return element.getAttribute('title');
        }
        return '';
    }

    // === BUSCA SEMÂNTICA ENTERPRISE-GRADE ===
    function enterpriseSemanticSearch() {
        console.log('🔍 [LegacyAgent] Iniciando busca semântica Enterprise-grade...');
        
        // Fase 1: Busca em todos os inputs e contenteditables
        const allInputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
        for (const input of allInputs) {
            const val = extractValueFromElement(input);
            if (val && val.length > 0 && val !== 'undefined') {
                console.log(`🎯 [LegacyAgent] Fase 1 - Encontrado em input: "${val)}"`);
                return { element: input, value: val, method: 'semantic_input' };
            }
        }
        
        // Fase 2: Busca em células de tabela (td) com conteúdo relevante
        const allCells = document.querySelectorAll('td, th');
        for (const cell of allCells) {
            const val = extractValueFromElement(cell);
            // Filtra valores que parecem ser dados relevantes (não cabeçalhos genéricos)
            if (val && val.length > 2 && val.length < 100 && !/^(Nome|ID|Ativo|Status|Data|Ação|#)$/i.test(val)) {
                console.log(`🎯 [LegacyAgent] Fase 2 - Encontrado em célula: "${val)}"`);
                return { element: cell, value: val, method: 'semantic_td' };
            }
        }
        
        // Fase 3: Busca em labels com texto visível
        const allLabels = document.querySelectorAll('label, .label, [class*="label"]');
        for (const label of allLabels) {
            const val = extractValueFromElement(label);
            if (val && val.length > 2 && val.length < 100) {
                console.log(`🎯 [LegacyAgent] Fase 3 - Encontrado em label: "${val)}"`);
                return { element: label, value: val, method: 'semantic_label' };
            }
        }
        
        // Fase 4: Busca em spans e divs com conteúdo de dados
        const dataElements = document.querySelectorAll('span[class*="value"], div[class*="value"], span[class*="data"], div[class*="data"], [data-value]');
        for (const el of dataElements) {
            const val = extractValueFromElement(el);
            if (val && val.length > 0) {
                console.log(`🎯 [LegacyAgent] Fase 4 - Encontrado em elemento de dados: "${val)}"`);
                return { element: el, value: val, method: 'semantic_dataclass' };
            }
        }
        
        console.log('❌ [LegacyAgent] Busca semântica não encontrou valores.');
        return null;
    }

    // === BUSCA POR PARENT ELEMENT (LABELS E CÉLULAS ADJACENTES) ===
    function searchParentHierarchy(element, maxLevels = 3) {
        if (!element) return null;
        
        let current = element.parentElement;
        let level = 0;
        
        while (current && level < maxLevels) {
            // Tenta capturar texto de labels adjacentes
            const adjacentLabel = current.querySelector('label');
            if (adjacentLabel) {
                const labelText = extractValueFromElement(adjacentLabel);
                if (labelText && labelText.length > 2) {
                    console.log(`📖 [LegacyAgent] Parent Nível ${level + 1} - Label adjacente: "${labelText}"`);
                    return { value: labelText, method: 'parent_label', level: level + 1 };
                }
            }
            
            // Tenta capturar texto de células adjacentes (td)
            const adjacentTd = current.querySelector('td');
            if (adjacentTd && adjacentTd !== element) {
                const tdText = extractValueFromElement(adjacentTd);
                if (tdText && tdText.length > 2) {
                    console.log(`📖 [LegacyAgent] Parent Nível ${level + 1} - TD adjacente: "${tdText}"`);
                    return { value: tdText, method: 'parent_td', level: level + 1 };
                }
            }
            
            // Tenta capturar do próprio parent se for relevante
            const parentVal = extractValueFromElement(current);
            if (parentVal && parentVal.length > 2 && parentVal.length < 100) {
                console.log(`📖 [LegacyAgent] Parent Nível ${level + 1} - Texto direto: "${parentVal}"`);
                return { value: parentVal, method: 'parent_text', level: level + 1 };
            }
            
            current = current.parentElement;
            level++;
        }
        
        return null;
    }

    // === FUNÇÃO AUXILIAR: Busca fallback em todos os inputs (original + Enterprise) ===
    function findFirstInputWithValue() {
        // Primeiro tenta busca semântica Enterprise-grade
        const semanticResult = enterpriseSemanticSearch();
        if (semanticResult) {
            return semanticResult;
        }
        
        // Fallback para busca simples em inputs
        const allInputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]');
        for (const input of allInputs) {
            const val = extractValueFromElement(input);
            if (val && val.length > 0) {
                console.log(`🔍 [LegacyAgent] Fallback simples: encontrado valor em input → "${val}"`);
                return { element: input, value: val, method: 'fallback_input' };
            }
        }
        return null;
    }

    // Função para executar o plano de ações da IA
    async function executeActionPlan(plan, sendMessage) {
        const results = [];
        const total = plan.actions.length;

        for (let i = 0; i < plan.actions.length; i++) {
            const action = plan.actions[i];
            try {
                // === AÇÃO READ: Lê o valor do elemento e retorna ===
                if (action.type === 'read') {
                    let readValue = '';
                    let element = null;
                    let usedFallback = false;
                    let searchMethod = 'direct';

                    // Retry de 200ms para campos dinâmicos em sistemas legados
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            element = await waitForElement(action.selector, 2000);
                            readValue = extractValueFromElement(element);
                            
                            // Se encontrou valor, sai do retry
                            if (readValue && readValue.length > 0) {
                                searchMethod = 'direct_selector';
                                break;
                            }
                            
                            // Tenta ler do parentElement se valor vazia
                            if (!readValue && element && element.parentElement) {
                                const parentResult = searchParentHierarchy(element);
                                if (parentResult) {
                                    readValue = parentResult.value;
                                    searchMethod = parentResult.method;
                                    console.log(`📖 [LegacyAgent] READ via ${searchMethod} → "${readValue}"`);
                                    break;
                                }
                            }
                        } catch (err) {
                            // Seletor não encontrado, continua para fallback
                            console.log(`⚠️ [LegacyAgent] Seletor "${action.selector}" não encontrado, tentativa ${attempt + 1}/3`);
                        }
                        
                        // Aguarda 200ms antes do próximo retry
                        if (attempt < 2) {
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                    
                    // === FALLBACK ENTERPRISE: Se seletor falhou, busca semântica ===
                    if (!readValue || readValue.length === 0) {
                        console.log(`🔍 [LegacyAgent] Seletor "${action.selector}" vazio. Iniciando busca semântica Enterprise-grade...`);
                        const fallbackResult = findFirstInputWithValue();
                        if (fallbackResult) {
                            readValue = fallbackResult.value;
                            searchMethod = fallbackResult.method || 'semantic_search';
                            usedFallback = true;
                        }
                    }

                    // Purifica a string final (remove espaços extras, quebras de linha)
                    const purifiedValue = readValue ? readValue.replace(/\s+/g, ' ').trim() : '';

                    console.log(`📖 [LegacyAgent] READ ${action.selector} → "${purifiedValue}" [método: ${searchMethod}]${usedFallback ? ' (fallback)' : ''}`);
                    
                    // Envia o valor lido de volta para o VS Code (formato VALUE_RESULT)
                    sendMessage({ 
                        type: 'VALUE_RESULT', 
                        value: purifiedValue,
                        method: searchMethod
                    });
                    
                    // Também envia como read_result para compatibilidade
                    sendMessage({ 
                        type: 'read_result', 
                        payload: { 
                            selector: action.selector,
                            value: purifiedValue,
                            success: purifiedValue.length > 0,
                            usedFallback: usedFallback,
                            searchMethod: searchMethod
                        } 
                    });
                    
                    results.push({ actionIndex: i, selector: action.selector, success: purifiedValue.length > 0, value: purifiedValue, method: searchMethod });
                    
                    // Também envia como progress para streaming
                    sendMessage({ 
                        type: 'action_progress', 
                        payload: { 
                            actionIndex: i,
                            total: total,
                            type: 'read',
                            selector: action.selector, 
                            description: `Valor lido: ${purifiedValue}`,
                            success: purifiedValue.length > 0,
                            value: purifiedValue,
                            searchMethod: searchMethod
                        } 
                    });
                    
                    continue; // Próxima ação
                }

                // Para outras ações, aguarda o elemento normalmente
                const element = await waitForElement(action.selector, 2000);

                if (action.type === 'type') {
                    element.focus();
                    element.value = action.value || '';
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (action.type === 'click') {
                    element.click();
                } else if (action.type === 'select') {
                    element.value = action.value || '';
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (action.type === 'clear') {
                    element.value = '';
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (action.type === 'submit') {
                    if (element.tagName === 'FORM') {
                        element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    } else {
                        element.click();
                    }
                }

                // Reporta sucesso para o VS Code (formato completo)
                sendMessage({ 
                    type: 'action_progress', 
                    payload: { 
                        actionIndex: i,
                        total: total,
                        type: action.type,
                        selector: action.selector, 
                        description: action.description || '',
                        success: true 
                    } 
                });
                results.push({ actionIndex: i, selector: action.selector, success: true });
                console.log(`✅ [LegacyAgent] [${i + 1}/${total}] ${action.type} → ${action.selector}`);
                
                // Pausa pequena para o sistema legado processar
                await new Promise(r => setTimeout(r, 500)); 
                
            } catch (err) {
                // Reporta o erro real para o VS Code ver no Output
                sendMessage({ 
                    type: 'action_progress', 
                    payload: { 
                        actionIndex: i,
                        total: total,
                        type: action.type,
                        selector: action.selector, 
                        description: action.description || '',
                        success: false, 
                        error: err.message 
                    } 
                });
                results.push({ actionIndex: i, selector: action.selector, success: false, error: err.message });
                console.error(`❌ [LegacyAgent] [${i + 1}/${total}] ${action.type} → ${err.message}`);
                
                // Envia resultado final com falha
                sendMessage({ 
                    type: 'action_result', 
                    payload: {
                        planIntent: plan.intent || '',
                        results: results,
                        completedAt: new Date().toISOString(),
                        allSucceeded: false
                    }
                });
                return; // Para a execução se um passo falhar
            }
        }
        
        // Envia resultado final com sucesso
        sendMessage({ 
            type: 'action_result', 
            payload: {
                planIntent: plan.intent || '',
                results: results,
                completedAt: new Date().toISOString(),
                allSucceeded: results.every(r => r.success)
            }
        });
        console.log(`✅ [LegacyAgent] Plano executado: ${results.filter(r => r.success).length}/${total} ações com sucesso`);
    }

    // Função para mapear elementos interativos do DOM
    function mapDomElements() {
        const elements = [];
        let index = 0;
        
        // Inputs
        document.querySelectorAll('input, textarea, select').forEach(el => {
            elements.push({
                index: index++,
                tag: el.tagName.toLowerCase(),
                selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : `.${el.className.split(' ')[0]}`,
                id: el.id || '',
                name: el.name || '',
                type: el.type || '',
                className: el.className || '',
                placeholder: el.placeholder || '',
                label: el.getAttribute('aria-label') || '',
                value: el.value || ''
            });
        });
        
        // Buttons
        document.querySelectorAll('button, [type="submit"], [role="button"]').forEach(el => {
            elements.push({
                index: index++,
                tag: el.tagName.toLowerCase(),
                selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`,
                id: el.id || '',
                name: el.name || '',
                type: 'button',
                className: el.className || '',
                placeholder: '',
                label: el.innerText?.trim() || el.getAttribute('aria-label') || '',
                value: ''
            });
        });
        
        return elements;
    }

    // WebSocket handlers
    socket.onopen = () => {
        console.log('🟢 [LegacyAgent] Conectado ao CLI!');
        // Envia mapeamento inicial do DOM
        const elements = mapDomElements();
        socket.send(JSON.stringify({ type: 'DOM_READY', payload: elements }));
        console.log(`📄 [LegacyAgent] DOM mapeado: ${elements.length} elementos`);
    };

    socket.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            
            if (msg.type === 'action') {
                // Ação única
                const plan = { actions: [msg.payload], intent: 'single_action' };
                await executeActionPlan(plan, (m) => socket.send(JSON.stringify(m)));
            } else if (msg.type === 'action_plan') {
                // Plano de ações
                await executeActionPlan(msg.payload, (m) => socket.send(JSON.stringify(m)));
            } else if (msg.type === 'get_dom') {
                // Atualiza mapeamento do DOM
                const elements = mapDomElements();
                socket.send(JSON.stringify({ type: 'DOM_READY', payload: elements }));
            } else if (msg.type === 'pong') {
                // Resposta de ping - ignora
            }
        } catch (err) {
            console.error('❌ [LegacyAgent] Erro ao processar mensagem:', err);
        }
    };

    socket.onerror = (err) => {
        console.error('🔴 [LegacyAgent] Erro de conexão:', err);
    };

    socket.onclose = () => {
        console.log('🔌 [LegacyAgent] Desconectado do CLI');
    };
})();

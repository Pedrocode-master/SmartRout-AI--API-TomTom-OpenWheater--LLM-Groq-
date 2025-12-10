// static/js/route_logic.js - Contém a lógica de comunicação com o servidor Flask para cálculo de rota.
import { showMessage, updateRouteInfo, showRouteDetails } from './ui_utils.js';
import { drawRouteOnMap, clearRoute, drawRouteMarkers } from './map_utils.js';
import { getApiBaseUrl, setOriginCoords, setDestinationCoords, getCurrentPos, getCurrentAccuracy, getOriginCoords, getDestinationCoords } from './map_data.js';

// Exporta a função de limpeza para ser usada pelo events.js, se necessário.
export { clearRoute };

// Threshold (meters) under which we consider a GPS reading 'reliable' for routing
const GPS_RELIABLE_THRESHOLD = 150; // meters

/**
 * 🆕 NOVA FUNÇÃO: Coleta constraints do bottom sheet
 * Retorna objeto com { avoid: [...], prefer: [...] }
 */
function getRouteConstraints() {
    const constraints = {
        avoid: [],
        prefer: []
    };
    
    // Coleta checkboxes de "evitar"
    const avoidCheckboxes = document.querySelectorAll('input[name="avoid"]:checked');
    avoidCheckboxes.forEach(checkbox => {
        constraints.avoid.push(checkbox.value);
    });
    
    // Coleta radio de "preferir"
    const preferRadio = document.querySelector('input[name="prefer"]:checked');
    if (preferRadio) {
        constraints.prefer.push(preferRadio.value);
    }
    
    return constraints;
}

/**
 * 🆕 NOVA FUNÇÃO: Exibe status de otimização no bottom sheet
 */
function showOptimizationStatus(message, type = 'info') {
    const statusDiv = document.getElementById('optimization-status');
    if (!statusDiv) return;
    
    statusDiv.style.display = 'block';
    statusDiv.className = `optimization-status ${type}`;
    statusDiv.textContent = message;
    
    // Auto-hide após 10 segundos (exceto errors)
    if (type !== 'error') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 10000);
    }
}

/**
 * Função auxiliar para converter um endereço (string) em coordenadas.
 * Esta função assume que existe um endpoint /geocoding no seu servidor Flask.
 * @param {string} address - O endereço a ser geocodificado.
 * @returns {Promise<{lon: number, lat: number}|null>} Coordenadas ou null.
 */
async function geocodeAddress(address) {
    const ngrokUrl = getApiBaseUrl();
    if (!ngrokUrl) {
        showMessage('Erro: URL do servidor não definida.', 'error');
        return null;
    }
    
    // Detecta entradas que já são coordenadas no formato "lat, lon" ou "lon, lat"
    const coord = parseCoordinateString(address);
    if (coord) {
        console.log(`[GEOCODING] Entrada detectada como coordenadas: ${coord.lat.toFixed(6)}, ${coord.lon.toFixed(6)}`);
        return coord; // já no formato { lon, lat }
    }

    const url = `${ngrokUrl}/geocoding`; 
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: address })
        });

        const result = await response.json();
        
        if (response.ok && result.lon && result.lat) {
            console.log(`[GEOCODING] Endereço '${address}' convertido para: ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
            return { lon: result.lon, lat: result.lat };
        } else {
            showMessage(`Erro de geocodificação para: "${address}". Detalhe: ${result.erro || 'Endereço não encontrado'}`, 'error');
            console.error(`[GEOCODING] Falha ao geocodificar ${address}:`, result);
            return null;
        }
    } catch (error) {
        console.error('Erro no fetch de geocodificação:', error);
        showMessage('Erro de conexão ao geocodificar o endereço.', 'error');
        return null;
    }
}


/**
 * Tenta interpretar uma string como um par de coordenadas.
 * Aceita formatos como "-23.4750, -47.4415" (geralmente lat, lon)
 * ou "-47.4415, -23.4750" (lon, lat). Retorna { lon, lat } ou null.
 */
function parseCoordinateString(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim();
    // Regex simples: número, vírgula, número
    const m = cleaned.match(/^\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;

    // Decidir se é lat,lon ou lon,lat
    // Se primeiro valor estiver entre -90 e 90, trata como latitude
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        // a = lat, b = lon
        return { lon: b, lat: a };
    }
    // Caso contrário, assume primeiro = lon, segundo = lat
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
        return { lon: a, lat: b };
    }
    // Ambíguo/fora de intervalo
    return null;
}


/**
 * Função principal para calcular, desenhar a rota e atualizar a UI.
 * Agora coleta constraints e envia ao backend para otimização inteligente.
 * 
 * @param {string} originInput - Endereço de partida (string) ou a string 'GPS'.
 * @param {string} destinationInput - Endereço de destino (string).
 */
export async function calculateRouteFromAddresses(originInput, destinationInput) {
    clearRoute();
    showMessage('Calculando rota...', 'info');

    // 1. Processar Origem
    let originCoords = null;
    if (originInput.toUpperCase() === 'GPS') {
        const currentPos = getCurrentPos();
        if (currentPos) {
            // currentPos é [lon, lat]
            // Checa a precisão atual antes de usar a posição GPS como origem
            const acc = getCurrentAccuracy && getCurrentAccuracy();
            const ACC_THRESHOLD = GPS_RELIABLE_THRESHOLD;
            if (acc && acc > ACC_THRESHOLD) {
                showMessage(`Posição GPS disponível, mas imprecisa (${acc.toFixed(0)} m). Aguarde leituras melhores ou insira um endereço.`, 'error');
                return;
            }
            originCoords = { lon: currentPos[0], lat: currentPos[1] };
            showMessage(`Origem definida pela sua localização GPS.`, 'info');
        } else {
            showMessage('Erro: Posição GPS não disponível. Tente novamente ou insira um endereço de origem.', 'error');
            return;
        }
    } else {
        // Geocodificar Endereço de Origem
        originCoords = await geocodeAddress(originInput);
        if (!originCoords) {
            return; // Falha na geocodificação, a mensagem de erro já foi exibida
        }
    }

    // 2. Processar Destino (Sempre Endereço)
    const destinationCoords = await geocodeAddress(destinationInput);
    if (!destinationCoords) {
        return; // Falha na geocodificação
    }

    // 3. Salvar Coordenadas no Estado Compartilhado
    setOriginCoords(originCoords);
    setDestinationCoords(destinationCoords);
    
    // 4. Espera o mapa estar pronto (evita race condition onde vectorSource ainda é null)
    await waitForMapReady();

    // 5. Desenhar Marcadores de Rota (A e B) - somente se coordenadas válidas
    if (getOriginCoords() && getDestinationCoords()) {
        drawRouteMarkers();
    } else {
        showMessage('Coordenadas inválidas para desenhar marcadores.', 'error');
        return;
    }
    
    // 🆕 6. Coletar constraints do bottom sheet
    const constraints = getRouteConstraints();
    const hasConstraints = constraints.avoid.length > 0 || constraints.prefer.length > 0;
    
    if (hasConstraints) {
        console.log('[ROUTE_LOGIC] Constraints detectadas:', constraints);
        showOptimizationStatus('🧠 Analisando tráfego, clima e otimizando rota...', 'info');
    }
    
    // 7. Chamar a API de Rota com as Coordenadas Encontradas (agora com constraints)
    await fetchRouteData(originCoords, destinationCoords, hasConstraints ? constraints : null);
}

/**
 * ✅ CORRIGIDO: Função isolada para chamar a API com coordenadas.
 * MANTÉM A LÓGICA ORIGINAL DE COMPATIBILIDADE COM BACKENDS ALTERNATIVOS
 * + ADICIONA suporte a constraints
 * 
 * @param {{lon: number, lat: number}} origin - Coordenadas de origem.
 * @param {{lon: number, lat: number}} destination - Coordenadas de destino.
 * @param {Object|null} constraints - Objeto com {avoid: [], prefer: []} ou null
 */
async function fetchRouteData(origin, destination, constraints = null) {
    const ngrokUrl = getApiBaseUrl();
    if (!ngrokUrl) {
        showMessage('Erro: URL do servidor não definida.', 'error');
        return;
    }

    // O servidor Flask padrão espera [lon, lat]
    const coords = [
        [origin.lon, origin.lat],
        [destination.lon, destination.lat]
    ];
    
    try {
        // ========================================================================
        // ✅ MANTIDO: Lógica de seleção de endpoint flexível (SEU CÓDIGO ORIGINAL)
        // ========================================================================
        const preferredRouteEndpoint = (typeof window !== 'undefined' && window.__API_BASE_URL) 
            ? '/calculate_route'  // Backend alternativo (ex: Colab)
            : '/rota';             // Backend padrão (Flask)
        
        // ========================================================================
        // ✅ MANTIDO: Preparação de payload adaptável (SEU CÓDIGO ORIGINAL)
        // ========================================================================
        let requestBody = { coordinates: coords };
        
        if (preferredRouteEndpoint === '/calculate_route') {
            // Colab/backend alternativo espera origin/destination como objetos
            requestBody = {
                origin: { lat: origin.lat, lon: origin.lon },
                destination: { lat: destination.lat, lon: destination.lon }
            };
        }
        
        // ========================================================================
        // 🆕 ADICIONADO: Constraints (se existirem)
        // ========================================================================
        if (constraints) {
            requestBody.constraints = constraints;
            console.log('[ROUTE_LOGIC] Enviando constraints ao backend:', constraints);
        }

        // ========================================================================
        // ✅ MANTIDO: Fetch com endpoint flexível (SEU CÓDIGO ORIGINAL)
        // ========================================================================
        const response = await fetch(`${ngrokUrl}${preferredRouteEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const geojsonResult = await response.json();

        if (!response.ok) {
            // Respostas de erro do backend podem propagar o status da ORS (ex: 401/403).
            const detail = geojsonResult.detalhe || geojsonResult.error || geojsonResult.erro || geojsonResult.message || JSON.stringify(geojsonResult);
            console.error('[ERRO API ORS]', response.status, detail);

            if (response.status === 401 || response.status === 403) {
                showMessage(
                    `Acesso negado ao serviço de rotas (ORS). Verifique sua chave ORS e permissões da conta. Detalhe: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
                    'error'
                );
                showOptimizationStatus('❌ Erro de acesso à API de rotas', 'error');
                return;
            }

            // Mensagem genérica para outros códigos de erro
            showMessage(`Erro ao calcular a rota: ${geojsonResult.erro || 'Erro desconhecido.'}`, 'error');
            showOptimizationStatus('❌ Falha ao calcular rota', 'error');
            return;
        }
        
        // 🆕 Verifica se a resposta contém dados de otimização
        let optimizationData = null;
        try {
            if (geojsonResult.features && geojsonResult.features[0] && geojsonResult.features[0].properties) {
                optimizationData = geojsonResult.features[0].properties.optimization;
            }
        } catch (e) {
            console.debug('[ROUTE_LOGIC] Nenhum dado de otimização encontrado');
        }
        
        // 1. Desenhar a rota no mapa (e receber metadados extraídos, se disponíveis)
        let mapExtract = null;
        try {
            mapExtract = drawRouteOnMap(geojsonResult) || null;
        } catch (e) {
            console.debug('[ROUTE] drawRouteOnMap returned error:', e);
            mapExtract = null;
        }
        
        // 2. Extrair e exibir informações da rota (suporta múltiplos formatos retornados pelo backend/ORS)
        let distance = 'N/A';
        let duration = 'N/A';
        let stepsArray = null;

        function tryNumber(v) {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }

        // Tenta extrair summary de várias possíveis localizações
        let found = false;
        // 1) Top-level `routes[0].summary` (alguns fakes ou APIs podem usar isso)
        if (!found && geojsonResult.routes && geojsonResult.routes[0] && geojsonResult.routes[0].summary) {
            const s = geojsonResult.routes[0].summary;
            const rawDist = tryNumber(s.distance);
            const rawDur = tryNumber(s.duration);
            if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
            if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }
        }

        // 2) FeatureCollection -> features[0].properties.summary
        if (!found && Array.isArray(geojsonResult.features) && geojsonResult.features.length > 0) {
            const props = geojsonResult.features[0].properties || {};
            if (props.summary) {
                const rawDist = tryNumber(props.summary.distance || props.summary.distance_in_meters || props.summary.distance_m);
                const rawDur = tryNumber(props.summary.duration || props.summary.duration_in_seconds || props.summary.duration_s);
                if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
                if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }
            }

            // 3) ORS often coloca as informações em properties.segments[0].summary or segments[0] contains distance/duration
            if (!found && props.segments && Array.isArray(props.segments) && props.segments.length > 0) {
                const seg = props.segments[0];
                const rawDist = tryNumber(seg.distance || seg.summary && seg.summary.distance);
                const rawDur = tryNumber(seg.duration || seg.summary && seg.summary.duration);
                if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
                if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }

                // steps podem estar aqui
                if (Array.isArray(seg.steps)) {
                    stepsArray = seg.steps;
                }
            }
        }

        // 4) Fallback: procure recursivamente por qualquer campo `summary` contendo distance/duration
        if (!found) {
            try {
                const walk = (obj) => {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj.distance && obj.duration) return { distance: tryNumber(obj.distance), duration: tryNumber(obj.duration) };
                    for (const k of Object.keys(obj)) {
                        const v = obj[k];
                        if (v && typeof v === 'object') {
                            const r = walk(v);
                            if (r) return r;
                        }
                    }
                    return null;
                };
                const r = walk(geojsonResult);
                if (r) {
                    if (r.distance !== null) { distance = (r.distance / 1000).toFixed(2) + ' km'; found = true; }
                    if (r.duration !== null) { duration = Math.round(r.duration / 60) + ' min'; found = true; }
                }
            } catch (e) {
                console.debug('[ROUTE] recursive summary search failed', e);
            }
        }

        console.debug('[ROUTE] summary extraction result:', { distance, duration, found });
        
        // Se não encontramos summary inteiro, tente usar o que o mapa extraiu
        if ((!found || distance === 'N/A' || duration === 'N/A') && mapExtract) {
            if (!found && mapExtract.distance) distance = mapExtract.distance;
            if (!found && mapExtract.duration) duration = mapExtract.duration;
        }
        
        // Chama a função de UI
        updateRouteInfo(distance, duration);

        // Preparar HTML extra com passos (se disponível)
        let extraHTML = '';
        try {
            // Use stepsArray if foi preenchido durante a extração
            let steps = stepsArray;
            if (!steps) {
                // fallback para formatos tradicionais
                if (geojsonResult.routes && geojsonResult.routes[0] && geojsonResult.routes[0].segments && geojsonResult.routes[0].segments[0] && Array.isArray(geojsonResult.routes[0].segments[0].steps)) {
                    steps = geojsonResult.routes[0].segments[0].steps;
                } else if (Array.isArray(geojsonResult.features) && geojsonResult.features[0] && geojsonResult.features[0].properties && geojsonResult.features[0].properties.segments && Array.isArray(geojsonResult.features[0].properties.segments) && Array.isArray(geojsonResult.features[0].properties.segments[0].steps)) {
                    steps = geojsonResult.features[0].properties.segments[0].steps;
                }
            }

            if (Array.isArray(steps) && steps.length > 0) {
                extraHTML = '<ol class="route-steps">' + steps.map(s => {
                    const instr = s.instruction || s.description || 'Passo';
                    const distm = tryNumber(s.distance) || 0;
                    return `<li>${instr} (${Math.round(distm)} m)</li>`;
                }).join('') + '</ol>';
            }
            
            // 🆕 Adiciona informações de otimização se disponíveis
            if (optimizationData && optimizationData.enabled) {
                extraHTML = `
                    <div style="background: #e7f3ff; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #007bff;">
                        <strong>✨ Rota Otimizada</strong><br>
                        <small style="color: #004085; line-height: 1.6;">
                            ${optimizationData.reasoning || 'Rota ajustada considerando tráfego e clima.'}<br>
                            <span style="display: inline-block; margin-top: 5px;">
                                🌤️ ${optimizationData.weather || 'Clima: não disponível'}<br>
                                🚦 Tráfego: ${((optimizationData.traffic_factor || 1) * 100 - 100).toFixed(0)}% acima do normal
                            </span>
                        </small>
                    </div>
                ` + extraHTML;
            }
            
        } catch (err) {
            console.debug('[ROUTE_LOGIC] failed to build extra steps HTML', err);
            extraHTML = '';
        }

        // Disparar evento para o bottom sheet exibir os detalhes
        try {
            showRouteDetails({ 
                distance, 
                duration, 
                infoText: `Distância: ${distance} • Duração: ${duration}`, 
                extraHTML, 
                state: 'medium' 
            });
        } catch (err) {
            console.error('[ROUTE_LOGIC] failed to show route details', err);
        }
        
        // 🆕 Atualiza status de otimização
        if (optimizationData && optimizationData.enabled) {
            showOptimizationStatus(
                `✅ Rota otimizada! ${optimizationData.reasoning ? optimizationData.reasoning.substring(0, 80) : 'Ajustes aplicados com sucesso.'}`,
                'success'
            );
        }

        console.log("[SUCCESS] GeoJSON recebido. Rota desenhada e UI atualizada.");
        showMessage(`Rota calculada! Distância: ${distance}, Duração: ${duration}`, 'success');

    } catch (error) {
        console.error('Erro no fetch da rota:', error);
        showMessage('Erro de conexão ao calcular a rota. Verifique a URL do Ngrok e o servidor Flask.', 'error');
        showOptimizationStatus('❌ Erro de conexão com o servidor', 'error');
    }
}


/**
 * ✅ MANTIDO: A função calculateAndDrawRoute (antiga drawRoute) é mantida para clique no mapa.
 * 
 * @param {{lon: number, lat: number}} origin - Coordenadas de origem.
 * @param {{lon: number, lat: number}} destination - Coordenadas de destino.
 */
export async function calculateAndDrawRoute(origin, destination) {
    clearRoute();
    showMessage('Calculando rota por coordenadas...', 'info');

    // Salvar Coordenadas no Estado Compartilhado para desenhar os marcadores
    setOriginCoords(origin);
    setDestinationCoords(destination);
    
    // Desenhar Marcadores de Rota (A e B)
    await waitForMapReady();
    drawRouteMarkers();
    
    // 🆕 Coleta constraints mesmo para rotas por clique
    const constraints = getRouteConstraints();
    const hasConstraints = constraints.avoid.length > 0 || constraints.prefer.length > 0;
    
    if (hasConstraints) {
        showOptimizationStatus('🧠 Otimizando rota com suas preferências...', 'info');
    }
    
    // Chamar a API de Rota com as Coordenadas
    await fetchRouteData(origin, destination, hasConstraints ? constraints : null);
}

// Alias para manter a compatibilidade com o listener de clique no mapa (events.js)
window.drawRoute = calculateAndDrawRoute; 

/**
 * Aguarda o evento `mapReady` caso o mapa (vector source) ainda não esteja disponível.
 * Retorna imediatamente se `getVectorSource()` já estiver definido.
 */
function waitForMapReady() {
    // Import local para checar a disponibilidade da fonte de vetores.
    return import('./map_data.js').then(mod => {
        if (mod.getVectorSource()) return;
        return new Promise((resolve) => {
            document.addEventListener('mapReady', () => resolve(), { once: true });
        });
    });
}
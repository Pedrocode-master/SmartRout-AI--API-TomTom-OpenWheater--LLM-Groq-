// static/js/map_utils.js - Funções para gerenciar o desenho e a limpeza de rotas (OpenLayers).
import { 
    getMapInstance, 
    getVectorSource, 
    getRotatual, 
    setRotatual,
    getOriginMarker,
    getDestinationMarker,
    setOriginMarker,
    setDestinationMarker,
    getOriginCoords, // 🚨 NOVO: Para obter as coords de origem
    getDestinationCoords, // 🚨 NOVO: Para obter as coords de destino
    setOriginCoords, // 🚨 NOVO: Para limpar o estado
    setDestinationCoords // 🚨 NOVO: Para limpar o estado
} from './map_data.js';

import {
    originMarkerStyle, // 🚨 NOVO: Estilo para origem
    destinationMarkerStyle, // 🚨 NOVO: Estilo para destino
    routeStyle // 🚨 NOVO: Estilo da rota
} from './styles.js';

// OpenLayers imports (assumindo que o ol está globalmente disponível via CDN no HTML)
const ol = window.ol; 

// A função clearRoute agora é mais limpa e remove a rota, os marcadores de rota E as coordenadas salvas.
/**
 * Remove a rota anterior e todos os marcadores de rota (Origem/Destino) do mapa.
 */
export function clearRoute() {
    const vectorSource = getVectorSource();
    const rotatual = getRotatual();
    
    if (vectorSource) {
        // 1. Limpar rota
        if (rotatual) {
            vectorSource.removeFeature(rotatual);
            setRotatual(null);
        }
        
        // 2. Limpar Marcadores
        const markers = [getOriginMarker(), getDestinationMarker()];
        markers.forEach(marker => {
            if (marker) {
                vectorSource.removeFeature(marker);
            }
        });
        setOriginMarker(null);
        setDestinationMarker(null);

        // 3. Limpar Coordenadas Armazenadas 🚨 NOVO
        setOriginCoords(null);
        setDestinationCoords(null);
        
        console.log("[MAP_UTILS] Rota e Marcadores de Rota removidos.");
    }
}

/**
 * Desenha os marcadores de Origem e Destino no mapa.
 * Assume que as coordenadas estão salvas em map_data.js
 */
export function drawRouteMarkers() {
    clearRoute(); // Garante que marcadores e rota antigos sejam limpos

    const vectorSource = getVectorSource();
    const originCoords = getOriginCoords();
    const destinationCoords = getDestinationCoords();
    // Se a fonte de vetor ainda não estiver pronta, aguarda por 'mapReady' e tenta novamente.
    if (!vectorSource) {
        console.warn('[MAP_UTILS] Fonte de vetor ainda não disponível. Aguardando mapReady para desenhar marcadores.');
        document.addEventListener('mapReady', () => {
            // Re-tentativa segura (verifica novamente o estado)
            const vs = getVectorSource();
            const o = getOriginCoords();
            const d = getDestinationCoords();
            if (vs && o && d) {
                drawRouteMarkers();
            } else {
                console.warn('[MAP_UTILS] Ainda não é possível desenhar marcadores após mapReady.');
            }
        }, { once: true });
        return;
    }

    if (!originCoords || !destinationCoords) {
        console.warn('[MAP_UTILS] Coordenadas de origem/destino ausentes. Aborting drawRouteMarkers.');
        return;
    }

    // 1. Marcador de Origem (A)
    const originPoint = ol.proj.fromLonLat([originCoords.lon, originCoords.lat]);
    const originMarkerFeature = new ol.Feature({
        geometry: new ol.geom.Point(originPoint),
        name: 'Origem'
    });
    originMarkerFeature.setStyle(originMarkerStyle);
    
    vectorSource.addFeature(originMarkerFeature);
    setOriginMarker(originMarkerFeature);
    
    // 2. Marcador de Destino (B)
    const destinationPoint = ol.proj.fromLonLat([destinationCoords.lon, destinationCoords.lat]);
    const destinationMarkerFeature = new ol.Feature({
        geometry: new ol.geom.Point(destinationPoint),
        name: 'Destino'
    });
    destinationMarkerFeature.setStyle(destinationMarkerStyle);

    vectorSource.addFeature(destinationMarkerFeature);
    setDestinationMarker(destinationMarkerFeature);
    
    console.log("[MAP_UTILS] Marcadores de Origem e Destino desenhados.");
}


/**
 * Desenha a rota no mapa a partir do GeoJSON e ajusta a visualização.
 * @param {object} geojsonResult - O objeto GeoJSON retornado pelo ORS.
 */
export function drawRouteOnMap(geojsonResult) {
    const map = getMapInstance();
    const vectorSource = getVectorSource();

    if (!map || !vectorSource || !geojsonResult) {
        console.error("[MAP_UTILS] Dependências ausentes para desenhar a rota.");
        return;
    }
    
    // Garantir que a rota anterior seja removida, mas manter os marcadores de rota
    const rotatual = getRotatual();
    if (rotatual) {
        vectorSource.removeFeature(rotatual);
        setRotatual(null);
    }
    
    try {
        // A polilinha codificada (encoded polyline) está no primeiro segmento (segments[0].steps[0].polyline)
        // Mas a resposta do ORS com /geojson geralmente tem a geometria na propriedade 'coordinates' da feature
        // VAMOS ASSUMIR O FORMATO ORIGINAL DO ORS (encoded_polyline):
        
        // 1. Encontra a geometria codificada (se for do endpoint /route)
        const encodedGeometry = geojsonResult.routes?.[0]?.geometry;
        
        if (!encodedGeometry) {
            // Se não encontrou a polilinha codificada, tenta ler o GeoJSON completo
            console.log("[MAP_UTILS] Tentando ler GeoJSON Feature...");
            const format = new ol.format.GeoJSON();
            const features = format.readFeatures(geojsonResult, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });

            // Encontra a primeira feature geométrica compatível (LineString / MultiLineString)
            let routeFeature = null;
            for (let f of features) {
                const geom = f.getGeometry();
                if (geom && (geom instanceof ol.geom.LineString || geom instanceof ol.geom.MultiLineString)) {
                    routeFeature = f;
                    break;
                }
            }

            if (routeFeature) {
                routeFeature.setStyle(routeStyle);
                vectorSource.addFeature(routeFeature);
                setRotatual(routeFeature);

                // Ajusta a visualização para a rota
                const view = map.getView();
                view.fit(routeFeature.getGeometry().getExtent(), {
                    padding: [100, 100, 100, 100], // Margem
                    duration: 1000 // Animação de 1 segundo
                });

                // Extrai propriedades da primeira Feature LineString do GeoJSON original (se existir)
                let extracted = { distance: null, duration: null, extraHTML: '' };
                try {
                    const dataFeatures = Array.isArray(geojsonResult.features) ? geojsonResult.features : [];
                    let dataFeature = dataFeatures.find(f => f && f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')) || dataFeatures[0] || null;
                    if (dataFeature && dataFeature.properties) {
                        const props = dataFeature.properties;

                        // Helper para parsear distância (pode vir como '5.2 km' ou número em metros)
                        const parseDistance = (v) => {
                            if (v === null || v === undefined) return null;
                            if (typeof v === 'number') return (v / 1000).toFixed(2) + ' km';
                            if (typeof v === 'string') {
                                const m = v.match(/([0-9]+(?:[\.,][0-9]+)?)/);
                                if (m) {
                                    const num = parseFloat(m[1].replace(',', '.'));
                                    // Se a string contém 'km' usa como km, se contém 'm' assume metros
                                    if (/km/i.test(v)) return num.toFixed(2) + ' km';
                                    if (/m\b/i.test(v)) return (num/1000).toFixed(2) + ' km';
                                    // fallback: assume metros
                                    return (num/1000).toFixed(2) + ' km';
                                }
                            }
                            return null;
                        };

                        const parseDuration = (v) => {
                            if (v === null || v === undefined) return null;
                            if (typeof v === 'number') return Math.round(v/60) + ' min';
                            if (typeof v === 'string') {
                                const m = v.match(/([0-9]+(?:[\.,][0-9]+)?)/);
                                if (m) {
                                    const num = parseFloat(m[1].replace(',', '.'));
                                    if (/h/i.test(v)) return Math.round(num*60) + ' min';
                                    if (/min/i.test(v) || /m\b/i.test(v)) return Math.round(num) + ' min';
                                    // fallback assume minutes
                                    return Math.round(num) + ' min';
                                }
                            }
                            return null;
                        };

                        // Possíveis campos onde distância/duração podem estar
                        const candidatesDist = [props.summary && props.summary.distance, props.distance, props.length, props.distance_m, props.distance_in_meters];
                        const candidatesDur = [props.summary && props.summary.duration, props.duration, props.time, props.duration_s, props.duration_in_seconds];

                        for (const c of candidatesDist) {
                            const p = parseDistance(c);
                            if (p) { extracted.distance = p; break; }
                        }
                        for (const c of candidatesDur) {
                            const p = parseDuration(c);
                            if (p) { extracted.duration = p; break; }
                        }

                        // Steps/descrições para extraHTML
                        if (props.segments && Array.isArray(props.segments) && props.segments[0] && Array.isArray(props.segments[0].steps)) {
                            const steps = props.segments[0].steps;
                            extracted.extraHTML = '<ol class="route-steps">' + steps.map(s => `<li>${s.instruction || s.description || 'Passo'} (${Math.round(s.distance||0)} m)</li>`).join('') + '</ol>';
                        } else if (props.steps && Array.isArray(props.steps)) {
                            const steps = props.steps;
                            extracted.extraHTML = '<ol class="route-steps">' + steps.map(s => `<li>${s.instruction || s.description || 'Passo'} (${Math.round(s.distance||0)} m)</li>`).join('') + '</ol>';
                        }
                    }
                } catch (e) {
                    console.debug('[MAP_UTILS] falha ao extrair propriedades da feature:', e);
                }

                console.log('[MAP_UTILS] Rota GeoJSON desenhada e mapa ajustado. Extraído:', extracted);
                return extracted;
            }
            console.error("[MAP_UTILS] Geometria da rota não encontrada na resposta do ORS.");
            return { distance: null, duration: null, extraHTML: '' };
        }


        // 2. Cria o leitor de polilinha do OpenLayers (OpenRouteService/Google usa Padrão 5)
        const format = new ol.format.Polyline({
            factor: 1e5 // O ORS utiliza um fator de precisão de 5 (10^5)
        });

        // 3. Lê a geometria (converte a string codificada em uma geometria ol.geom.LineString)
        const geometry = format.readGeometry(encodedGeometry, {
            dataProjection: 'EPSG:4326', // WGS84 (como a polilinha é codificada)
            featureProjection: 'EPSG:3857' // Web Mercator (como o OpenLayers renderiza)
        });

        // 4. Cria o Feature da rota
        const routeFeature = new ol.Feature({
            geometry: geometry,
            name: 'Rota Calculada'
        });
        routeFeature.setStyle(routeStyle);

        // 5. Adiciona e salva a referência
        vectorSource.addFeature(routeFeature);
        setRotatual(routeFeature);

        // 6. Ajusta a visualização para a rota
        const view = map.getView();
        view.fit(geometry.getExtent(), {
            padding: [100, 100, 100, 100], // Margem
            duration: 1000 // Animação de 1 segundo
        });
        
        console.log("[MAP_UTILS] Rota GeoJSON desenhada e mapa ajustado.");
        return { distance: null, duration: null, extraHTML: '' };

    } catch (e) {
        console.error("[MAP_UTILS] Erro ao processar ou desenhar a rota:", e);
    }
}
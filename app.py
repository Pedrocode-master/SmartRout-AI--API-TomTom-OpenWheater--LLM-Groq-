import requests
import json
import logging
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Importa serviços de otimização
from utils.route_optimizer import RouteOptimizer

# ========================================================================
# CARREGAMENTO SEGURO DE VARIÁVEIS DE AMBIENTE
# ========================================================================
load_dotenv()  # Carrega .env automaticamente

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========================================================================
# VALIDAÇÃO DE CHAVES DE API
# ========================================================================
# ORS é obrigatória sempre
ORS_API_KEY = os.environ.get('ORS_API_KEY')
if not ORS_API_KEY:
    raise ValueError(
        "⚠️ ORS_API_KEY não encontrada!\n"
        "Configure com: export ORS_API_KEY='sua_chave' no ~/.bashrc ou no .env"
    )

# Chaves para otimização (opcional - se não existirem, usa modo fallback)
TOMTOM_API_KEY = os.environ.get('TOMTOM_API_KEY')
OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')

optimization_available = all([TOMTOM_API_KEY, OPENWEATHER_API_KEY, GROQ_API_KEY])

if not optimization_available:
    logger.warning("⚠️ Chaves de otimização ausentes. Modo de otimização desabilitado.")
    logger.warning("   Para habilitar: configure TOMTOM_API_KEY, OPENWEATHER_API_KEY e GROQ_API_KEY no .env")
    route_optimizer = None
else:
    # Inicializa o otimizador apenas se todas as chaves estiverem disponíveis
    route_optimizer = RouteOptimizer(
        tomtom_key=TOMTOM_API_KEY,
        openweather_key=OPENWEATHER_API_KEY,
        groq_key=GROQ_API_KEY
    )
    logger.info("✅ RouteOptimizer inicializado com TomTom + OpenWeather + Groq")

# Variáveis de configuração ORS
ORS_API_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
ORS_USE_BEARER = os.environ.get('ORS_USE_BEARER', '0') == '1'

# ========================================================================
# CONFIGURAÇÃO DO FLASK
# ========================================================================
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
CORS(app)

# ========================================================================
# ENDPOINTS
# ========================================================================

@app.route('/')
def index():
    """Serve a página principal"""
    ngrok_url = os.environ.get('NGROK_URL', None) 
    try:
        return render_template('index.html', ngrok_url=ngrok_url) 
    except Exception as e:
        logger.error(f"Erro ao servir index.html: {e}")
        return "Erro interno do servidor ao carregar a página.", 500


@app.route('/geocoding', methods=['POST'])
def geocode_address():
    """Converte um endereço (string) em coordenadas (lon, lat) usando o ORS Geocoding."""
    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify({"erro": "Payload JSON inválido ou ausente"}), 400

    address = data.get('address')
    if not address:
        return jsonify({"erro": "Endereço ausente"}), 400

    logger.info(f"[GEOCODING ORS] Recebendo requisição para: {address}")
    
    geocode_url = "https://api.openrouteservice.org/geocode/search"
    
    headers = {}
    if ORS_USE_BEARER:
        headers['Authorization'] = f"Bearer {ORS_API_KEY}"
    else:
        headers['Authorization'] = ORS_API_KEY
    headers['Accept'] = 'application/json'
    
    params = {
        'text': address,
        'boundary.country': 'BRA',
        'size': 1
    }

    try:
        response = requests.get(geocode_url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        result = response.json()

        features = result.get('features') if isinstance(result, dict) else None
        if features:
            coords = features[0].get('geometry', {}).get('coordinates', [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                logger.info(f"[GEOCODING ORS] Sucesso: {address} -> ({lat}, {lon})")
                return jsonify({"lon": lon, "lat": lat})
            else:
                logger.warning(f"[GEOCODING ORS] Geometria inválida no resultado para: {address}")
                return jsonify({"erro": "Geometria inválida retornada pela API de geocoding."}), 502
        else:
            logger.warning(f"[GEOCODING ORS] Endereço não encontrado: {address}")
            return jsonify({"erro": "Endereço não encontrado ou inválido"}), 404

    except requests.exceptions.HTTPError as http_err:
        ors_error_detail = {}
        try:
            ors_error_detail = response.json()
        except (ValueError, json.JSONDecodeError):
            ors_error_detail = {"raw_error": getattr(response, 'text', str(response))}
            
        logger.error(f"[ERRO HTTP GEO] {http_err}")
        logger.error(f"[DETALHE ORS GEO] {json.dumps(ors_error_detail, indent=4)}")

        return jsonify({"erro": f"Erro de API ORS Geocoding: {http_err}", "detalhe": ors_error_detail}), 500

    except Exception as e:
        logger.exception(f"[ERRO INTERNO GEO] Falha ao geocodificar: {e}")
        return jsonify({"erro": "Erro interno de geocodificação."}), 500


@app.route('/rota', methods=['POST'])
def calcular_rota():
    """
    Endpoint de rota com otimização inteligente integrada.
    
    Se constraints forem fornecidas E as chaves de otimização estiverem disponíveis:
        - Consulta TomTom (tráfego) + OpenWeather (clima)
        - Pede ao Groq para analisar e sugerir ajustes
        - Aplica ajustes aos parâmetros do ORS
        - Retorna rota otimizada
    
    Caso contrário:
        - Comportamento original (chamada direta ao ORS)
    """
    logger.info("[ROTA] Recebendo requisição de rota...")
    
    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify({"erro": "Payload JSON inválido ou ausente"}), 400

    coordinates = data.get('coordinates')
    if not coordinates or not isinstance(coordinates, list) or len(coordinates) < 2:
        return jsonify({"erro": "Coordenadas de rota ausentes ou incompletas."}), 400

    # Validação simples dos pontos (numéricos)
    try:
        for pt in coordinates:
            if not (isinstance(pt, (list, tuple)) and len(pt) >= 2):
                raise ValueError('Formato de coordenada inválido')
            float(pt[0]); float(pt[1])
    except Exception:
        return jsonify({"erro": "Formato de coordenadas inválido. Use [[lon, lat], [lon, lat]]"}), 400

    # Extrai constraints (opcional)
    constraints = data.get('constraints', None)
    
    # Converte coordenadas [lon, lat] para {lat, lon} para o otimizador
    origin = {"lat": coordinates[0][1], "lon": coordinates[0][0]}
    destination = {"lat": coordinates[1][1], "lon": coordinates[1][0]}
    
    logger.info(f"[ROTA] Coordenadas: {coordinates}")
    if constraints:
        logger.info(f"[ROTA] Constraints detectadas: {constraints}")

    # ========================================================================
    # DECISÃO: USAR OTIMIZAÇÃO OU ORS DIRETO?
    # ========================================================================
    use_optimization = (
        constraints and 
        optimization_available and 
        route_optimizer is not None
    )

    if use_optimization:
        logger.info("[ROTA] Modo de otimização ativado (Groq + TomTom + Weather)")
        try:
            # Chama o otimizador completo
            optimization_result = route_optimizer.optimize_route(
                origin=(origin['lat'], origin['lon']),
                destination=(destination['lat'], destination['lon']),
                constraints=constraints
            )
            
            if not optimization_result:
                logger.warning("[ROTA] Otimização falhou, revertendo para ORS padrão")
                use_optimization = False
            else:
                # Extrai informações da otimização
                selected = optimization_result.get('selected_route', {})
                reasoning = optimization_result.get('reasoning', '')
                weather_desc = selected.get('weather_description', '')
                
                # Agora chama o ORS para obter a geometria real da rota
                # (o TomTom geometry pode ser diferente do ORS, então mantemos ORS)
                ors_payload = {
                    "coordinates": coordinates,
                    "profile": "driving-car",
                    "format": "geojson",
                    "units": "m",
                    "instructions": False
                }
                
                # Aplica parâmetros de otimização ao ORS se disponíveis
                # Por exemplo, se deve evitar pedágios
                if constraints.get('avoid'):
                    avoid_features = []
                    if 'toll' in constraints['avoid']:
                        avoid_features.append('tollways')
                    if 'highway' in constraints['avoid']:
                        avoid_features.append('highways')
                    if 'ferry' in constraints['avoid']:
                        avoid_features.append('ferries')
                    
                    if avoid_features:
                        ors_payload['options'] = {'avoid_features': avoid_features}
                
                headers = {}
                if ORS_USE_BEARER:
                    headers['Authorization'] = f"Bearer {ORS_API_KEY}"
                else:
                    headers['Authorization'] = ORS_API_KEY
                headers['Content-Type'] = 'application/json'

                logger.info("[ROTA] Chamando ORS com parâmetros otimizados...")

                response = requests.post(
                    f"{ORS_API_URL}/geojson",
                    json=ors_payload,
                    headers=headers,
                    timeout=15
                )

                response.raise_for_status()
                geojson_data = response.json()
                
                # Enriquece o GeoJSON com dados da otimização
                if 'features' in geojson_data and len(geojson_data['features']) > 0:
                    feature = geojson_data['features'][0]
                    if 'properties' not in feature:
                        feature['properties'] = {}
                    
                    # Adiciona metadados de otimização
                    feature['properties']['optimization'] = {
                        'enabled': True,
                        'reasoning': reasoning,
                        'weather': weather_desc,
                        'traffic_factor': selected.get('traffic_factor', 1.0),
                        'weather_factor': selected.get('weather_factor', 1.0),
                        'constraints_applied': constraints
                    }
                
                logger.info("[ROTA] Rota otimizada retornada com sucesso.")
                return jsonify(geojson_data)
                
        except Exception as e:
            logger.exception(f"[ROTA] Erro durante otimização: {e}")
            logger.warning("[ROTA] Revertendo para modo ORS padrão")
            use_optimization = False

    # ========================================================================
    # MODO PADRÃO (SEM OTIMIZAÇÃO)
    # ========================================================================
    if not use_optimization:
        logger.info("[ROTA] Modo padrão (ORS direto, sem otimização)")
        
        ors_payload = {
            "coordinates": coordinates,
            "profile": "driving-car",
            "format": "geojson",
            "units": "m",
            "instructions": False
        }

        # Modo de teste: se a variável DISABLE_ORS estiver definida, retorna um GeoJSON falso
        if os.environ.get('DISABLE_ORS') == '1':
            logger.info('[ROTA] DISABLE_ORS=1 ativado – retornando GeoJSON falso para testes locais')
            fake_geojson = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [coordinates[0], coordinates[1]]
                    },
                    "properties": {}
                }],
                "routes": [{"summary": {"distance": 1234.5, "duration": 600}}]
            }
            return jsonify(fake_geojson)

        try:
            headers = {}
            if ORS_USE_BEARER:
                headers['Authorization'] = f"Bearer {ORS_API_KEY}"
            else:
                headers['Authorization'] = ORS_API_KEY
            headers['Content-Type'] = 'application/json'

            logger.info("[ROTA] Enviando payload ao ORS...")

            response = requests.post(
                f"{ORS_API_URL}/geojson",
                json=ors_payload,
                headers=headers,
                timeout=10
            )

            response.raise_for_status()
            try:
                geojson_data = response.json()
            except (ValueError, json.JSONDecodeError):
                logger.error('[ROTA] Resposta ORS não contém JSON válido')
                return jsonify({"erro": "Resposta inválida da API ORS."}), 502

            logger.info("[ROTA] Rota recebida com sucesso (modo padrão).")
            return jsonify(geojson_data)
            
        except requests.exceptions.HTTPError as http_err:
            ors_error_detail = {}
            status_code = None
            try:
                status_code = response.status_code
                ors_error_detail = response.json()
            except (ValueError, json.JSONDecodeError):
                ors_error_detail = {"raw_error": getattr(response, 'text', str(response))}
            except Exception:
                ors_error_detail = {"raw_error": str(http_err)}

            logger.error(f"[ERRO HTTP] {http_err}")
            logger.error(f"[DETALHE ORS] {json.dumps(ors_error_detail, indent=4)}")

            resp_payload = {"erro": "Erro de API ORS.", "detalhe": ors_error_detail}
            if status_code and isinstance(status_code, int) and 400 <= status_code < 600:
                return jsonify(resp_payload), status_code
            return jsonify(resp_payload), 502

        except Exception as e:
            logger.exception(f"[ERRO INTERNO] Falha ao processar rota: {e}")
            return jsonify({"erro": "Erro interno ao processar rota."}), 500


# ========================================================================
# INICIALIZAÇÃO DO SERVIDOR
# ========================================================================
if __name__ == '__main__':
    ngrok_url = os.environ.get('NGROK_URL', None)
    if not ngrok_url:
        logger.warning("Variável de ambiente NGROK_URL não definida. As chamadas da API podem falhar.")
    
    port = int(os.environ.get('PORT', 5000)) 
    logger.info(f"🚀 Servidor iniciando na porta {port}")
    logger.info("📍 Endpoints disponíveis:")
    logger.info("   GET  /             - Interface web")
    logger.info("   POST /geocoding    - Geocodificação de endereços")
    logger.info("   POST /rota         - Cálculo de rota (com otimização inteligente se constraints fornecidas)")
    
    if optimization_available:
        logger.info("   ✨ Otimização inteligente: ATIVADA")
    else:
        logger.info("   ⚠️  Otimização inteligente: DESATIVADA (chaves ausentes)")
    
    app.run(debug=True, host='0.0.0.0', port=port)
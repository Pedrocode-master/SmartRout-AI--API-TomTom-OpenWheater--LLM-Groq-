# app.py
# Aplicação principal Flask, rotas e inicialização do servidor/ngrok
import requests
from flask import Flask, request, render_template, jsonify, url_for
from pyngrok import ngrok
from threading import Thread
import os
from requests.exceptions import RequestException # Importação mais robusta

# Importa módulos locais
from .config import NGROK_AUTH_TOKEN
from .utils import ensure_csv_exists, append_gps_data

# Configurações
BASE_PATH = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_PATH, 'templates'),
    static_folder=os.path.join(BASE_PATH, 'static')
)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# 🚨 VARIÁVEL GLOBAL DE CHAVE DE API (FORA DA FUNÇÃO)
ORS_API_KEY = "PUT_YOUR_KEY"

# Garante que o CSV exista ao iniciar a aplicação
ensure_csv_exists()

# =======================================================
# FUNÇÕES DE AJUDA PARA FORMATAÇÃO
# =======================================================

def format_duration(seconds):
    #""Converte segundos em string legível (ex: '1h 15 min').""
    if seconds is None or seconds < 0:
        return "N/A"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    # Garante que '0 min' seja exibido se o tempo for muito curto e não houver horas
    if minutes > 0 or not parts and seconds >= 0: 
        parts.append(f"{minutes} min")
        
    return " ".join(parts)

def format_distance(meters):
    #""Converte metros em string legível (ex: '12.5 km' ou '500 m').""
    if meters is None or meters < 0:
        return "N/A"
    
    if meters >= 1000:
        # Arredonda para uma casa decimal
        return f"{meters / 1000:.1f} km" 
    # Para distâncias menores que 1km, exibe em metros inteiros
    return f"{int(meters)} m" 

# ===========================
# ROTAS DO FLASK
# ===========================

@app.route('/')
def index():
    print("LOG FLASK: Rota '/' acessada com sucesso.") # 🚨 Debug log
    return render_template('index.html')

# 🚨 ROTA DE TESTE (Se esta rota der 404, o problema é no ngrok/Colab, não no código)
@app.route('/test_connection', methods=['GET'])
def test_connection():
    print("LOG FLASK: Rota '/test_connection' GET acessada com sucesso.") # 🚨 Debug log
    return jsonify({"status": "Servidor Flask Acessível"}), 200

@app.route('/update_gps', methods=['POST'])
def update_gps():
    # Rota para receber dados de GPS (e.g., de um dispositivo externo).
    data = request.get_json()
    lat = data.get('lat')
    lon = data.get('lon')

    if lat is None or lon is None:
        print("⚠️ Recebido: Dados incompletos. Ignorado.")
        return jsonify({"error": "Dados incompletos"}), 400

    try:
        append_gps_data(lat, lon, data.get('alt'), data.get('timestamp'))
        print(f"✔ Recebido GPS: {lat}, {lon}")
        return jsonify({"status": "OK"})
    except Exception as e:
        print(f"Erro ao escrever no CSV: {e}")
        return jsonify({"error": "Erro interno ao processar dados"}), 500


@app.route('/rota', methods=['POST'])
def rota():
    # 🚨 Debug log: Se você ver isso, o erro 404 é FALSO.
    print("LOG FLASK: Rota '/rota' POST iniciada no servidor.") 
    
    resp = None
    
    try:
        data = request.get_json()
        if 'origem' not in data or 'destino' not in data:
            return jsonify({"error": "Dados incompletos (origem/destino)"}), 400

        # ORS espera [lon, lat] para cada ponto
        body = {"coordinates": [
            [data['origem']['lon'], data['origem']['lat']], 
            [data['destino']['lon'], data['destino']['lat']]
        ]}

        headers = {
            "Authorization": ORS_API_KEY, # Utilizando a variável global
            "Content-Type": "application/json"
        }

        # Chamada síncrona para a API de rota
        resp = requests.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            json=body,
            headers=headers,
            timeout=30
        )
        resp.raise_for_status() # Lança HTTPError para 4xx/5xx

        # 1. Obter e processar a resposta do ORS
        ors_response = resp.json()
        
        # 2. Extrair informações da rota principal
        routes = ors_response.get('routes')
        if not routes:
            error_details = ors_response.get('error', {}).get('message', 'Nenhuma rota encontrada.')
            # A API ORS retornou 404 (erro de rota) ou 200 sem rotas.
            print(f"LOG ORS: Falha na rota. Detalhe: {error_details}")
            return jsonify({"error": f"Erro na rota: {error_details}"}), 404
            
        route_data = routes[0]
        
        # 3. Extrair DISTÂNCIA e DURAÇÃO (em metros e segundos)
        summary = route_data.get('summary', {})
        distance_meters = summary.get('distance')
        duration_seconds = summary.get('duration')
        
        # 4. Formatar os dados para o Frontend
        formatted_distance = format_distance(distance_meters)
        formatted_duration = format_duration(duration_seconds)
        
        # 5. RETORNAR o JSON CONSOLIDADO para o Frontend
        return jsonify({
            "geojson": ors_response, 
            "distance": formatted_distance, 
            "duration": formatted_duration,
        })

    except requests.exceptions.HTTPError as he:
        # Tratamento de erro HTTP mais robusto (4xx/5xx da API ORS, incluindo o 403 Forbidden)
        err_msg = str(he)
        if resp is not None:
            try:
                err_json = resp.json()
                err_msg = err_json.get('error', {}).get('message', str(he))
            except:
                pass 
        print("HTTP error /rota:", he, resp.text if resp is not None else 'Sem resposta.')
        return jsonify({"error": f"Erro na API de rota (HTTP): {err_msg}"}), 500
    
    except requests.exceptions.RequestException as re:
        # Tratamento de erro de conexão (Timeout, DNS, etc.)
        print("Erro de Conexão na API /rota:", re)
        return jsonify({"error": f"Erro de conexão com a API de rota: {str(re)}"}), 503

    except Exception as e:
        print("Erro interno no endpoint /rota:", e)
        return jsonify({"error": f"Erro interno no servidor: {str(e)}"}), 500

# ===========================
# INICIALIZAÇÃO
# ===========================

def start_server():
    #Inicia o servidor Flask.
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)

def run_app():
    #Inicia o Flask e configura o ngrok
    # 1. Inicia o Flask em uma Thread separada
    Thread(target=start_server).start()

    # 2. Configuração e Conexão ngrok com tratamento de erro
    try:
        ngrok.set_auth_token(NGROK_AUTH_TOKEN)
        public_url = ngrok.connect(5000).public_url
        print("🌍 Seu website está acessível por este link público (via ngrok):")
        print(public_url)
    except Exception as e:
        print(f"🚨 ERRO CRÍTICO ao iniciar ngrok: {e}")
        print("Verifique seu token de autenticação e o limite de sessões do ngrok.")

if __name__ == "__main__":
    run_app()

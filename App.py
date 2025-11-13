from flask import Flask, request, render_template_string, jsonify
from pyngrok import ngrok
import csv, os, time
from threading import Thread
import requests

CSV_FILE = "gps_data.csv"
app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["lat", "lon", "alt", "timestamp"])

@app.route('/')
def index():
    version = int(time.time())
    return render_template_string(f"""...""")

@app.route('/update_gps', methods=['POST'])
def update_gps():
    data = request.get_json()  # Receives the data sent via POST in JSON format
    with open(CSV_FILE, "a", newline="") as f:  # Opens the CSV file in append mode and writes the received data
        writer = csv.writer(f)
        writer.writerow([data.get('lat'), data.get('lon'), data.get('alt'), data.get('timestamp')])
    print(f"✔ Recebido: {data}")  # Prints the received data in the terminal
    return "OK"  # Returns "OK" to the client that made the request

# ===========================
# OpenRouteService intermediary route with error handling
# ===========================
@app.route('/rota', methods=['POST'])
def rota():
    try:
        data = request.get_json()  # Receives the data sent via POST in JSON format
        if 'origem' not in data or 'destino' not in data:  # Checks if the data contains 'origem' and 'destino'
            return jsonify({"error": "Dados incompletos"}), 400  # Returns error 400 if any data is missing

        body = {"coordinates": [data['origem'], data['destino']]}  # Builds the request body for the OpenRouteService API
        headers = {
            "Authorization": "PUT_YOUR_AUTHENTIC_KEY",
            "Content-Type": "application/json"
        }
        resp = requests.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            json=body,
            headers=headers
        )
        resp.raise_for_status()  # Ensures the response has no HTTP error (raises exception if it does)
        return jsonify(resp.json())  # Returns the JSON received from the API to the client
    except Exception as e:
        print("Erro no endpoint /rota:", e)  # In case of any error, prints it in the terminal
        return jsonify({"error": str(e)}), 500  # Returns error 500 to the client

def start_server():
    app.run(port=5000, debug=False)  # Starts the Flask server

Thread(target=start_server).start()  # Starts the Flask server in a separate thread
ngrok.set_auth_token("PUT_YOUR_AUTHENTIC_KEY")  # Sets the ngrok auth token
public_url = ngrok.connect(5000)  # Creates the ngrok tunnel on port 5000 and gets the public link
print("🌍 Your website is accessible at this public link  (via ngrok):")
print(public_url)  # Prints the public link in the terminal

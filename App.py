from flask import Flask, request, render_template, jsonify
from pyngrok import ngrok
import csv, os, time
from threading import Thread
import requests

CSV_FILE = "gps_data.csv"
app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# Create CSV if it does not exist
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["lat", "lon", "alt", "timestamp"])

@app.route('/')
def index():
    version = int(time.time())
    return render_template("index.html", version=version)

@app.route('/update_gps', methods=['POST'])
def update_gps():
    data = request.get_json()
    with open(CSV_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([data.get('lat'), data.get('lon'), data.get('alt'), data.get('timestamp')])
    print(f"✔ Received: {data}")
    return "OK"

@app.route('/rota', methods=['POST'])
def route():
    try:
        data = request.get_json()
        if 'origem' not in data or 'destino' not in data:
            return jsonify({"error": "Missing data"}), 400

        # Get OpenRouteService API key from environment variable
        api_key = os.getenv("ORS_API_KEY")
        if not api_key:
            return jsonify({"error": "API key not set in environment variable ORS_API_KEY"}), 500

        body = {"coordinates": [data['origem'], data['destino']]}
        headers = {
            "Authorization": api_key,
            "Content-Type": "application/json"
        }

        resp = requests.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            json=body,
            headers=headers
        )
        resp.raise_for_status()
        return jsonify(resp.json())

    except Exception as e:
        print("Error in /rota endpoint:", e)
        return jsonify({"error": str(e)}), 500

def start_server():
    app.run(port=5000, debug=False)

# Start Flask in a separate thread
Thread(target=start_server).start()

# Setup ngrok
ngrok.set_auth_token(os.getenv("NGROK_AUTH_TOKEN", ""))  # optional
public_url = ngrok.connect(5000)

print("🌍 Your website is accessible at this public link (via ngrok):")
print(public_url)
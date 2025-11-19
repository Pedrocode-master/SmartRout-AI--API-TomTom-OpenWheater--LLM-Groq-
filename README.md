🧭 Project: Interactive GPS Tracking and Mapping System
---

📝 Description
This project is an interactive web application developed using Python (Flask) and JavaScript (OpenLayers) for the visualization and tracking of real-time geospatial data.
---

The system has been modularized and optimized for rapid execution and debugging in cloud-based environments like Google Colab, leveraging Google Drive as the persistent file system and ngrok to create a public access tunnel.

---
✨ Highlights and New Features (Change Log)
This section emphasizes the significant improvements made to the project:
| Feature | Status | Change / Improvement |
|---|---|---|
| Architecture | ✅ Modularized | Complete code restructuring into separate modules (app.py, config.py, utils.py) for better organization, maintainability, and testing. |
| Front-end | ✅ Separated | Separation of HTML into templates (header.html, map.html, etc.) and CSS/JS into dedicated static/ folders, following the standard Flask (Jinja2) pattern. |
| Infrastructure | ✅ Cloud-Optimized | Configuration to run directly on Google Colab, using drive.mount() and os.chdir() to access and persistently save data in Google Drive. |
| Deployment | ✅ Public Access | Automatic configuration of the pyngrok tunnel within app.py to generate an instant public access URL. |
| Data | ✅ Persistence | Implementation of logic in utils.py to ensure secure writing of GPS data into a CSV file stored in Google Drive. |
💻 How to Run the Project (Quick Guide)
The easiest and most recommended way to run this application is via Google Colab:
1. Prerequisites
 * A Google account (for access to Drive and Colab).
 * An OpenRouteService (ORS) API key for routing functionality (or use the test key included).
2. Execution via Colab (Recommended Method)
 * Open a new notebook in Google Colab.
 * Copy and paste the automated initialization script (SETUP_SCRIPT.py) that handles file creation and environment configuration (This script is not included here, but you have it from previous sessions).
 * Execute the cell.
 * When prompted, authorize mounting your Google Drive.
 * The script will install dependencies, save all project files into the seu_projeto_gps folder in your Drive, and start the Flask server.
 * Click the public ngrok link provided in the output to access the application.
3. Local Execution (Alternative)
 * Clone the repository.
 * Install dependencies: pip install -r requirements.txt.
 * Set environment variables (NGROK_AUTH_TOKEN, ORS_API_KEY).
 * Execute: python app.py.


---
🗂️ Code Structure
seu_projeto_gps/
├── app.py           # Main Flask application (routes, server, ngrok)
├── config.py        # Configuration and keys (tokens, ORS API)
├── utils.py         # Data handling functions (CSV logging)
├── requirements.txt # Python dependencies (Flask, pyngrok, requests)
├── templates/
│   ├── index.html   # Main template (Jinja2)
│   ├── header.html  # Header/controls component
│   ├── map.html     # Map container
│   └── bottom_sheet.html # Route details component
└── static/
    ├── css/         # CSS styles
    │   ├── main.css
    │   └── ...
    └── js/          # JavaScript logic (OpenLayers)
        ├── map_init.js
        └── ...



----
⚙️ Dependencies
 * Backend: Python 3.8+
 * Python Libraries: Flask, pyngrok, requests
 * Frontend: OpenLayers v7.4.0 (Mapping and Geometry)
🤝 Contributions
Contributions are welcome! If you have suggestions to improve the routing logic, Flask stability, or Colab integration, feel free to open an Issue or submit a Pull Request.

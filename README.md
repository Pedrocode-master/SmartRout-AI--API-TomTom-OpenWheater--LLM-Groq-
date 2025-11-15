qGPS Full-Stack with OpenLayers and Routing API

Overview

This project is a full-stack GPS application that tracks your location, displays it on an interactive map, and allows routing between points using the OpenRouteService API. It combines a Python Flask back-end with a front-end built with OpenLayers for map visualization.

Unlike typical setups, this project was developed and executed entirely on Google Colab, which is why PyNGrok is used to expose a public URL for the Flask server.


---

Features

Real-time GPS tracking and accuracy visualization.

Map interaction: click/tap on a location to generate a route from your current position.

Full integration with OpenRouteService for driving directions.

Mobile-friendly map interface.

Ability to follow your movement automatically or manually center the map.

Data logging to a CSV file (gps_data.csv) for later analysis.



---

Why Google Colab and PyNGrok?

Since this project was developed without a local computer, Google Colab was used as the development environment.
To make the Flask app accessible externally (since Colab cannot directly serve web apps), PyNGrok is used to create a temporary public URL. This allows you to interact with the map from your mobile or any device with internet access.


---

Installation / Setup

1. Clone the repository:



git clone https://github.com/YOUR_USERNAME/gps-fullstack-openlayers.git
cd gps-fullstack-openlayers

2. Install dependencies:



pip install flask pyngrok requests

3. Run the Flask app in Google Colab:



Open the Colab notebook.

Make sure you provide your OpenRouteService API key in the variable ORS_API_KEY.

Execute the cells to start the server.

Copy the public URL provided by PyNGrok and open it in your browser (mobile recommended).



---

Usage

Map Interaction

Follow your location: Toggle the "Follow" button to automatically center the map on your current GPS position.

Generate a route: Tap/click on a point on the map. The route from your current location to the selected destination will be displayed.

Center map manually: Use the "Centralizar" button to focus the map on your location.

Added input fields for origin and destination street names.

The system uses geocoding to convert typed addresses into coordinates.

Routes are now generated from the entered origin to the entered destination.

Clicking on the map still works as a fallback if no address is provided.


CSV Logging

Your GPS data (latitude, longitude, altitude, timestamp) is automatically saved to gps_data.csv every time your position is updated.


---

Key Libraries and Tools

Tool / Library	Purpose

Flask	Python web framework for back-end routes and API
PyNGrok	Exposes Colab Flask server to the internet via a public URL
OpenLayers	Interactive map library for front-end map rendering
OpenRouteService	Provides route calculations and directions via API
Requests	Handles HTTP requests to OpenRouteService API
CSV	Stores GPS tracking data locally in gps_data.csv



---

Notes / Limitations



This project is actively under development. Additional features will be implemented to make the map more interactive, including new types of user interactions, better visualization of routes, and enhanced GPS tracking behaviors.

The project is optimized for mobile devices, but desktop usage is also possible.

Make sure you have a valid OpenRouteService API key; otherwise, route generation will return a 403 Forbidden error.


---

Project Structure

gps-fullstack-openlayers/
│
├── main.py               # Flask + OpenLayers app
├── gps_data.csv          # CSV file storing GPS logs
├── README.md             # This file
└── requirements.txt      # Python dependencies


---

Contributing

This is a personal project under active development. Contributions, suggestions, or bug reports are welcome. Please ensure that API keys are not shared publicly.


---

License

This project is licensed under the MIT License.


---
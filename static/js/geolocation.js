// static/js/geolocation.js
// Funções para obter e monitorar a localização GPS

// Depende das variáveis globais e funções de map_init.js

function handlePosition(pos, isInitialCenter = false) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const coord = ol.proj.fromLonLat([lon, lat]);
  currentPos = [lon, lat]; // Atualiza a posição global

  let shouldCenter = false;

  if (!markerFeature) {
    // Primeira vez que recebe GPS:
    markerFeature = new ol.Feature(new ol.geom.Point(coord));
    markerFeature.setStyle(markerStyle);
    vectorSource.addFeature(markerFeature);
    shouldCenter = true; // Força a centralização na primeira vez
  } else {
    markerFeature.getGeometry().setCoordinates(coord);
  }

  if (!accuracyFeature) {
    accuracyFeature = new ol.Feature(new ol.geom.Circle(coord, pos.coords.accuracy));
    accuracyFeature.setStyle(accuracyStyle);
    vectorSource.addFeature(accuracyFeature);
  } else {
    accuracyFeature.getGeometry().setCenter(coord);
    accuracyFeature.getGeometry().setRadius(pos.coords.accuracy);
  }

  updateStatus(`Lat: ${lat.toFixed(6)} Lon: ${lon.toFixed(6)} Acc: ${pos.coords.accuracy}m`);

  // 🔴 CORREÇÃO para o mapa azul não centralizar:
  // Centraliza se estiver na primeira leitura (isInitialCenter) OU se o 'following' estiver ligado
  if (following || shouldCenter) {
    if (shouldCenter) {
        // Ativa o 'following' na primeira centralização, e atualiza o botão
        following = true; 
        if (btnFollow) {
            btnFollow.textContent = '▶ Seguir: ON';
        }
    }
    map.getView().animate({ center: coord, zoom: Math.max(map.getView().getZoom(), 16), duration: 300 });
  }
}

function handleError(err) {
  console.error('Geolocation error:', err);
  if(err && err.code === 1) updateStatus('Permissão negada para acessar GPS.');
  else updateStatus('Erro ao obter GPS: ' + (err && (err.message || err.code)));
}

function startWatching() {
  if (!('geolocation' in navigator)) { updateStatus('Geolocation não suportado.'); return; }
  watchId = navigator.geolocation.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
}

function getCurrentOnceAndStartWatch(forceCenter = false) {
  if (!('geolocation' in navigator)) { updateStatus('Geolocation não suportado.'); return; }
  
  // O forceCenter é a flag usada para a primeira centralização
  navigator.geolocation.getCurrentPosition((pos) => {
    handlePosition(pos, forceCenter); 
    // Após a primeira leitura, o watchPosition assume
    startWatching();
  }, handleError, { enableHighAccuracy: true, timeout: 10000 });
}
// ⚠️ A chamada getCurrentOnceAndStartWatch() foi removida daqui e está no events.js,
// garantindo que ela só seja executada após a inicialização do mapa.

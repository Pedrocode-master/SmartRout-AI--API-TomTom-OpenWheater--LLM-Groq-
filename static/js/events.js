// static/js/events.js
// Lógica de manipulação de eventos (botões e clique no mapa)

// Depende de todas as variáveis e funções globais (map, getCurrentOnceAndStartWatch, drawRoute, geocode, currentPos, lat1, lon1, btnFollow, markerFeature, following, etc.)

window.addEventListener('load', () => {

    /* evento botão: gerar rota a partir das caixas */
    document.getElementById("rota").addEventListener("click", async () => {
      try {
        const origemText = document.getElementById("start").value.trim();
        const destinoText = document.getElementById("end").value.trim();
        if (!destinoText) return alert('Informe um destino.');

        let origemCoord;
        const d = await geocode(destinoText);
        // CRÍTICO: Garante que as coordenadas de destino são numéricas antes de enviar
        const destinoCoord = [parseFloat(d.lon), parseFloat(d.lat)];

        if (origemText) {
          const o = await geocode(origemText);
          // CRÍTICO: Garante que as coordenadas de origem são numéricas antes de enviar
          origemCoord = [parseFloat(o.lon), parseFloat(o.lat)];
          lon1 = parseFloat(o.lon); lat1 = parseFloat(o.lat);
        } else {
          // Tenta obter a posição atual se não houver origem definida
          if (!currentPos) {
              // Note: currentPos é um array de números [lon, lat] definido em geolocation.js
              await new Promise(resolve => {
                  getCurrentOnceAndStartWatch(true, resolve); 
              });
              if (!currentPos) return alert('Posição atual não disponível. Permita GPS ou informe origem.');
          }
          origemCoord = currentPos.slice();
          lon1 = origemCoord[0]; lat1 = origemCoord[1];
        }
        await drawRoute(origemCoord, destinoCoord, origemText || 'Posição Atual', destinoText);
      } catch (err) {
        console.error('Erro ao gerar rota (click):', err);
        alert('Erro: ' + (err.message || err.error || err));
      }
    });

    /* clique no mapa: gera rota */
    map.on('singleclick', function(evt) {
      (async () => {
        try {
          const [lon2, lat2] = ol.proj.toLonLat(evt.coordinate);
          // CRÍTICO: As coordenadas do clique já são numéricas por vir do OpenLayers
          const destinoCoord = [lon2, lat2]; 
          let origemCoord;
          let origemText = 'Posição Atual';

          if (document.getElementById("start").value.trim()) {
            if (lat1 === null || lon1 === null) {
              const o = await geocode(document.getElementById("start").value.trim());
              lat1 = parseFloat(o.lat); lon1 = parseFloat(o.lon); // Garante que são numéricas
            }
            origemCoord = [lon1, lat1];
            origemText = document.getElementById("start").value.trim();
          } else {
            if (!currentPos) {
                 return alert('Posição atual não disponível. Permita GPS ou informe origem.');
            }
            origemCoord = currentPos.slice();
            lon1 = origemCoord[0]; lat1 = origemCoord[1];
          }

          await drawRoute(origemCoord, destinoCoord, origemText, `Ponto Clicado [${lon2.toFixed(3)}, ${lat2.toFixed(3)}]`);

        } catch (err) {
          console.error('Erro ao gerar rota via clique:', err);
          alert('Erro ao gerar rota (clique): ' + (err.message || err));
        }
      })();
    });

    /* botões e follow */
    document.getElementById('btn-center').addEventListener('click', () => {
      if (markerFeature) {
          map.getView().animate({ center: markerFeature.getGeometry().getCoordinates(), zoom: 16, duration: 300 });
      } else {
          getCurrentOnceAndStartWatch(true); 
      }
    });

    if (btnFollow) {
      btnFollow.addEventListener('click', () => {
        following = !following;
        btnFollow.textContent = following ? '▶ Seguir: ON' : '▶ Seguir: OFF';
        if (following && markerFeature) {
             map.getView().animate({ center: markerFeature.getGeometry().getCoordinates(), zoom: 16, duration: 300 });
        }
      });
    }

    // INICIA A GEOLOCALIZAÇÃO APÓS O MAPA ESTAR PRONTO
    getCurrentOnceAndStartWatch(true); 
});

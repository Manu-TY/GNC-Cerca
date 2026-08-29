let mapa;
let marcadores = [];
let marcadorDestino = null;


// ===============================
// CALCULAR DISTANCIA
// ===============================

function distancia(lat1, lon1, lat2, lon2) {

  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}


// ===============================
// MOSTRAR ESTACIONES
// ===============================

async function cargarEstaciones(lat, lon) {

  const resultado =
    document.getElementById("resultado");

  resultado.innerHTML =
    "Buscando estaciones...";


  // Crear mapa

  if (!mapa) {

    mapa = L.map("mapa")
      .setView([lat, lon], 14);

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap"
      }
    ).addTo(mapa);

  } else {

    mapa.setView([lat, lon], 14);

    marcadores.forEach(m =>
      mapa.removeLayer(m)
    );

    marcadores = [];
  }


  // ===============================
  // MARCADOR DEL DESTINO
  // ===============================

  if (marcadorDestino) {

    mapa.removeLayer(marcadorDestino);
  }


  marcadorDestino = L.marker(
    [lat, lon],
    {
      draggable: true
    }
  )
  .addTo(mapa)
  .bindPopup(
    "📍 Destino<br>" +
    "Podés mover este punto."
  )
  .openPopup();


  // Cuando el usuario mueve el marcador

  marcadorDestino.on(
    "dragend",
    function () {

      const posicion =
        marcadorDestino.getLatLng();

      cargarEstaciones(
        posicion.lat,
        posicion.lng
      );

    }
  );


  // ===============================
  // CONSULTA ENARGAS
  // ===============================

  const url =
    "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";


  try {

    const respuesta =
      await fetch(url);

    const datos =
      await respuesta.json();


    if (!datos.features) {

      resultado.innerHTML =
        "No se pudieron obtener las estaciones de ENARGAS.";

      return;
    }


    // ===============================
    // PROCESAR ESTACIONES
    // ===============================

    let estaciones =
      datos.features.map(e => {

        const a =
          e.attributes || {};


        const nombre =
          a.RazonSocial ||
          a.RAZON_SOCIAL ||
          "Estación";


        const direccion =
          a.Direccion ||
          a.DIRECCION ||
          "";


        const localidad =
          a.Localidad ||
          a.LOCALIDAD ||
          "";


        const provincia =
          a.Provincia ||
          a.PROVINCIA ||
          "";


        // Coordenadas oficiales

        let latEstacion =
          parseFloat(a.Latitud);

        let lonEstacion =
          parseFloat(a.Longitud);


        // Respaldo

        if (
          !Number.isFinite(latEstacion) ||
          !Number.isFinite(lonEstacion)
        ) {

          latEstacion =
            parseFloat(e.geometry?.y);

          lonEstacion =
            parseFloat(e.geometry?.x);
        }


        return {

          nombre: nombre.trim(),

          direccion:
            (
              direccion +
              " " +
              localidad +
              " " +
              provincia
            )
            .replace(/\s+/g, " ")
            .trim(),

          lat: latEstacion,

          lon: lonEstacion

        };

      });


    // Eliminar estaciones sin coordenadas

    estaciones =
      estaciones.filter(e =>
        Number.isFinite(e.lat) &&
        Number.isFinite(e.lon)
      );


    // ===============================
    // CALCULAR DISTANCIAS
    // ===============================

    estaciones.forEach(e => {

      e.distancia =
        distancia(
          lat,
          lon,
          e.lat,
          e.lon
        );

    });


    // Ordenar

    estaciones.sort(
      (a, b) =>
        a.distancia - b.distancia
    );


    resultado.innerHTML = "";


    // ===============================
    // MOSTRAR LAS 10 MÁS CERCANAS
    // ===============================

    estaciones
      .slice(0, 10)
      .forEach(e => {


        // WAZE

        const waze =
          "https://waze.com/ul?ll=" +
          e.lat +
          "," +
          e.lon +
          "&navigate=yes";


        // GOOGLE MAPS

        const maps =
          "https://www.google.com/maps/dir/?api=1&destination=" +
          e.lat +
          "," +
          e.lon;


        // MARCADOR

        const marker =
          L.marker([
            e.lat,
            e.lon
          ])
          .addTo(mapa);


        marker.bindPopup(`

          <b>${e.nombre}</b>

          <br>

          ${e.direccion}

          <br>

          📏 ${e.distancia.toFixed(2)} km

          <br><br>

          <a
            target="_blank"
            href="${waze}">
            🚗 Waze
          </a>

          <br><br>

          <a
            target="_blank"
            href="${maps}">
            📍 Google Maps
          </a>

        `);


        marcadores.push(marker);


        // LISTA

        resultado.innerHTML += `

          <div class="estacion">

            <h3>
              ⛽ ${e.nombre}
            </h3>

            <p>
              ${e.direccion}
            </p>

            <p>
              📏 ${e.distancia.toFixed(2)} km
            </p>

            <a
              target="_blank"
              href="${waze}">
              🚗 Waze
            </a>

            &nbsp;

            <a
              target="_blank"
              href="${maps}">
              📍 Google Maps
            </a>

          </div>

        `;

      });


  } catch (error) {

    console.error(error);

    resultado.innerHTML =
      "Ocurrió un error al consultar ENARGAS.";

  }

}


// ===============================
// BUSCAR CERCA MÍO
// ===============================

function buscar() {

  navigator.geolocation.getCurrentPosition(

    function(pos) {

      cargarEstaciones(
        pos.coords.latitude,
        pos.coords.longitude
      );

    },

    function() {

      alert(
        "No pudimos obtener tu ubicación."
      );

    }

  );

}


// ===============================
// BUSCAR DESTINO
// ===============================

async function buscarDestino() {

  const texto =
    document
      .getElementById("destino")
      .value
      .trim();


  if (texto === "") {

    alert(
      "Escribí un destino."
    );

    return;
  }


  // ===============================
  // NOMINATIM
  // ===============================

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" +
    encodeURIComponent(texto);


  try {

    const respuesta =
      await fetch(url, {
        headers: {
          "Accept-Language": "es"
        }
      });


    const lugares =
      await respuesta.json();


    if (
      !lugares ||
      lugares.length === 0
    ) {

      alert(
        "No encontré esa dirección."
      );

      return;
    }


    // Tomamos el primer resultado

    const lat =
      parseFloat(
        lugares[0].lat
      );

    const lon =
      parseFloat(
        lugares[0].lon
      );


    // Mostrar estaciones

    cargarEstaciones(
      lat,
      lon
    );


  } catch (error) {

    console.error(error);

    alert(
      "No se pudo buscar la dirección."
    );

  }

}

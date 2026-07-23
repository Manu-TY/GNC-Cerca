let mapa;
let marcadores = [];

function distancia(lat1, lon1, lat2, lon2) {

    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;

    const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;

    return R * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}


async function buscar(){

const resultado=document.getElementById("resultado");

resultado.innerHTML="Buscando estaciones ENARGAS...";


navigator.geolocation.getCurrentPosition(async function(pos){

const lat=pos.coords.latitude;
const lon=pos.coords.longitude;


if(!mapa){

mapa=L.map("mapa").setView([lat,lon],13);

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
{
attribution:"© OpenStreetMap"
}
).addTo(mapa);

}else{

mapa.setView([lat,lon],13);

marcadores.forEach(m=>mapa.removeLayer(m));
marcadores=[];

}


let yo=L.marker([lat,lon])
.addTo(mapa)
.bindPopup("📍 Tu ubicación");

marcadores.push(yo);



const url =
"https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_int/GNC/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";


const respuesta=await fetch(url);

const datos=await respuesta.json();



let estaciones=datos.features.map(e=>{

return {

nombre:
e.attributes.RAZON_SOCIAL ||
e.attributes.RazonSocial ||
"Estación GNC",

direccion:
(e.attributes.DIRECCION || "")+
" "+
(e.attributes.LOCALIDAD || ""),

lat:e.geometry.y,
lon:e.geometry.x

};

});



estaciones.forEach(e=>{

e.distancia=distancia(
lat,
lon,
e.lat,
e.lon
);

});


estaciones.sort((a,b)=>a.distancia-b.distancia);


resultado.innerHTML="";



estaciones.slice(0,10).forEach(e=>{


let waze=
"https://waze.com/ul?ll="+e.lat+","+e.lon+"&navigate=yes";


let maps=
"https://www.google.com/maps/search/?api=1&query="+e.lat+","+e.lon;



let marcador=L.marker([e.lat,e.lon])
.addTo(mapa);


marcador.bindPopup(`

<b>⛽ ${e.nombre}</b><br>
${e.direccion}<br>
📏 ${e.distancia.toFixed(2)} km

<br><br>

<a href="${waze}" target="_blank">
🚗 Waze
</a>

<br><br>

<a href="${maps}" target="_blank">
📍 Maps
</a>

`);


marcadores.push(marcador);



resultado.innerHTML+=`

<div class="estacion">

<h3>⛽ ${e.nombre}</h3>

<p>${e.direccion}</p>

<p>
📏 ${e.distancia.toFixed(2)} km
</p>

<a href="${waze}" target="_blank">
🚗 Waze
</a>

&nbsp;

<a href="${maps}" target="_blank">
📍 Maps
</a>

</div>

`;

});


});


}

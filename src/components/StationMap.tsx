'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { stationData } from '../data/stations';
import { Navigation } from 'lucide-react';

import { useAppStore } from '../store/useAppStore';
import { BatteryCharging } from 'lucide-react'; // Icon အသစ်

// Station များအတွက် အစိမ်းရောင် Icon (Working unpkg link)
const stationIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet-color-markers/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function StationMap() {
  const stations = stationData.hits.hits.map(hit => hit._source);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);

  const defaultCenter: [number, number] = [16.78, 96.15];
  
  const setSelectedStation = useAppStore((state) => state.setSelectedStation);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setAccuracy(position.coords.accuracy);
        },
        (error) => {
          console.error("Location access denied or unavailable", error);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  return (
    <div className="w-full h-[450px] rounded-xl overflow-hidden shadow-sm border border-gray-200 relative z-0">
      <MapContainer 
        center={userLocation || defaultCenter} 
        zoom={13} 
        scrollWheelZoom={true} 
        className="w-full h-full"
      >
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* User ၏ လက်ရှိနေရာကို အပြာရောင် အစက်အဝိုင်းလေးဖြင့် ပြခြင်း */}
        {userLocation && (
          <>
            {/* အပြာရောင် အစက်လေး */}
            <CircleMarker 
              center={userLocation} 
              radius={8}
              pathOptions={{
                fillColor: '#2196F3',
                color: 'white',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
              }}
            >
              <Popup>
                <div className="font-bold text-blue-600">သင် ယခုရောက်ရှိနေသော နေရာ</div>
              </Popup>
            </CircleMarker>

            {/* တည်နေရာ တိကျမှုကိုပြသော အနားသတ် စက်ဝိုင်းနုလေး */}
            <Circle 
              center={userLocation} 
              radius={accuracy} 
              pathOptions={{ 
                color: '#2196F3', 
                fillColor: '#2196F3', 
                fillOpacity: 0.1, 
                weight: 1 
              }} 
            />
          </>
        )}

        {stations.map((station) => {
          // Google Maps Link (URL ပြဿနာများကို ဤနေရာတွင် ပြင်ဆင်ထားသည်)
        //   const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;


          // ဒီလိုင်းလေးကို အစားထိုးလိုက်ပါ
        // const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

        // အကယ်၍ User Location ကနေ စသွားချင်ရင် အောက်ကလို ရေးလို့ရပါတယ်
        const directionUrl = userLocation ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${station.lat},${station.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
          return (
            <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon}>
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <h3 className="font-bold text-green-700 text-sm mb-1">{station.name_text}</h3>
                  <p className="text-xs text-gray-600 mb-3">{station.address}</p>
                  
                  <div className="flex flex-col gap-2 mb-4">
                    <span className={`text-xs px-2 py-1 rounded inline-block w-fit ${station.is_24_7 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {station.is_24_7 ? '24/7 ဖွင့်သည်' : 'အချိန်အကန့်အသတ်ရှိသည်'}
                    </span>
                    <span className="text-xs text-gray-800">
                      <strong>Plugs:</strong> {station.plug_types.join(', ')}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedStation(station);
                      alert(`${station.name_text} ကို ရွေးချယ်လိုက်ပါပြီ။ အောက်ပါ Calculator တွင် ဆက်လက်တွက်ချက်ပါ။`);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition mb-2 border-none cursor-pointer"
                  >
                    <BatteryCharging size={16} /> ဒီ Station တွင် သွင်းမည်
                  </button>

                  <a 
                    href={directionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition no-underline"
                    style={{ color: 'white' }}
                  >
                    <Navigation size={16} /> Get Directions
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
// src/store/useAppStore.ts
import { create } from 'zustand';
import { ChargeParams } from '../lib/chargingCalc';
import B10ProfileImg from '../images/B10Profile.jpg';

interface AppState {
  selectedStation: any | null; 
  calcParams: ChargeParams;    
  setSelectedStation: (station: any) => void;
  updateCalcParams: (params: Partial<ChargeParams>) => void;
  globalAvgWaitMins: number; 
  setGlobalAvgWaitMins: (avg: number) => void;
  
  userProfile: {
    carPlate: string;
    carImage: string;
  };
  favoriteStations: string[];
  toggleFavorite: (stationId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedStation: null,
  globalAvgWaitMins: 10,
  calcParams: {
    vehicleId: 'v4', // Leapmotor B10 Default
    currentPercent: 20,
    targetPercent: 80,
    batteryCapacityKwh: 67.1,
    chargerKw: 30,
    isLeapmotorB10: true,
    pricePerKwh: 700,
    carsInQueue: 0,
    activePorts: 2, 
    avgWaitTimePerCarMins: 10,
  },
  
  userProfile: {
    carPlate: "1T/6919", // 👈 ပြင်ဆင်ပြီး
    carImage: typeof B10ProfileImg === 'string' ? B10ProfileImg : B10ProfileImg.src, 
  },
  favoriteStations: ["ST-004", "ST-001"], 

  toggleFavorite: (stationId) => set((state) => {
    const isFav = state.favoriteStations.includes(stationId);
    return {
      favoriteStations: isFav 
        ? state.favoriteStations.filter(id => id !== stationId) 
        : [...state.favoriteStations, stationId]
    };
  }),

  setSelectedStation: (station) => set((state) => {
    const portsCount = station.port_details ? Object.keys(station.port_details).length : 1;
    return {
      selectedStation: station,
      calcParams: {
        ...state.calcParams,
        chargerKw: station.port_details?.port_A || state.calcParams.chargerKw,
        activePorts: portsCount 
      }
    };
  }),

  setGlobalAvgWaitMins: (avg) => set((state) => ({
    globalAvgWaitMins: avg,
    calcParams: { ...state.calcParams, avgWaitTimePerCarMins: avg }
  })),

  updateCalcParams: (newParams) => set((state) => ({
    calcParams: { ...state.calcParams, ...newParams }
  })),
}));
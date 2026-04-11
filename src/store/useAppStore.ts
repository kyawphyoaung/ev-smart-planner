import { create } from 'zustand';
import { ChargeParams } from '../lib/chargingCalc';

interface AppState {
  isLoggedIn: boolean;
  currentUser: any;
  initAuth: () => void; // 👈 Hydration ရှင်းရန်
  setLogin: (user: any) => void;
  logout: () => void;

  selectedStation: any | null; 
  calcParams: ChargeParams;    
  setSelectedStation: (station: any) => void;
  updateCalcParams: (params: Partial<ChargeParams>) => void;
  globalAvgWaitMins: number; 
  setGlobalAvgWaitMins: (avg: number) => void;
  
  userProfile: {
    uid: string;
    carPlate: string;
    carImage: string;
    totalDistance: number;
    name: string;
  };
  setUserProfile: (profile: any) => void;
  
  favoriteStations: string[];
  toggleFavorite: (stationId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Server တွင် အမြဲ False ဖြစ်စေရန် ထားမည် (Hydration Error ကာကွယ်ရန်)
  isLoggedIn: false, 
  currentUser: null,

  initAuth: () => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('ev_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        // Google Sheet တွင် UID မရှိခဲ့ပါက Phone ကို ယာယီ UID အဖြစ် သုံးပါမည်
        const userUid = user.UID || user.uid || user.Phone; 
        set({ 
          isLoggedIn: true, 
          currentUser: { ...user, UID: userUid },
          userProfile: {
            uid: userUid, // 👈
            name: user.Name || user.name || 'EV User',
            carPlate: user.CarPlate || '1T/6919',
            carImage: user.CarImage || 'https://images.unsplash.com/photo-1672822709214-411bdbe054af?q=80&w=600&auto=format&fit=crop',
            totalDistance: Number(user.TotalDistance) || 0,
          }
        });
      }
    }
  },

  setLogin: (user) => {
    const userUid = user.UID || user.uid || user.Phone; // 👈
    const userWithUid = { ...user, UID: userUid };
    localStorage.setItem('ev_user', JSON.stringify(userWithUid));
    set({ 
      isLoggedIn: true, 
      currentUser: userWithUid,
      userProfile: {
        uid: userUid, // 👈
        name: user.Name || 'EV User',
        carPlate: user.CarPlate || 'UNKNOWN',
        carImage: user.CarImage || 'https://images.unsplash.com/photo-1672822709214-411bdbe054af?q=80&w=600',
        totalDistance: Number(user.TotalDistance) || 0,
      }
    });
  },
  logout: () => {
    localStorage.removeItem('ev_user');
    set({ isLoggedIn: false, currentUser: null });
  },

  selectedStation: null,
  globalAvgWaitMins: 10,
  calcParams: {
    vehicleId: 'v4',
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
    name: "EV Owner",
    carPlate: "1T/6919", 
    carImage: "https://images.unsplash.com/photo-1672822709214-411bdbe054af?q=80&w=600&auto=format&fit=crop", 
    totalDistance: 15200,
  },
  setUserProfile: (profile) => set((state) => ({ userProfile: { ...state.userProfile, ...profile } })),
  
  favoriteStations: ["1695112125155x661458112083656700", "1700891204657x979318291489095700"], 

  toggleFavorite: (stationId) => set((state) => {
    const isFav = state.favoriteStations.includes(stationId);
    return { favoriteStations: isFav ? state.favoriteStations.filter(id => id !== stationId) : [...state.favoriteStations, stationId] };
  }),

  setSelectedStation: (station) => set((state) => {
    // station.port_details အား station._source.port_details မှ ယူရန်ပြင်ဆင်ထားသည်
    const portsCount = station._source?.port_details ? Object.keys(station._source.port_details).length : 1;
    return { 
      selectedStation: station, 
      calcParams: { 
        ...state.calcParams, 
        chargerKw: station._source?.port_details?.port_A || state.calcParams.chargerKw, 
        activePorts: portsCount 
      } 
    };
  }),

  setGlobalAvgWaitMins: (avg) => set({ globalAvgWaitMins: avg }),
  updateCalcParams: (newParams) => set((state) => ({ calcParams: { ...state.calcParams, ...newParams } })),
}));
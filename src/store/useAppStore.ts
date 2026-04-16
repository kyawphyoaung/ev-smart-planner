import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChargeParams } from '../lib/chargingCalc';
import B10Profile from '../images/B10Profile.jpg';

interface AppState {
  isLoggedIn: boolean;
  currentUser: any;
  initAuth: () => void;
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

  // --- Active Charging Session Logic ---
  activeSession: {
    id: string | null;
    isCharging: boolean;
    originalStartTime: string | null;
    originalStartPercent: number;
    lastSyncTime: string | null;
    lastSyncPercent: number;
    lastSyncKwh: number;
    consumedKwh: number;
    logs: any[];
  };
  startActiveCharging: (id: string, startPercent: number) => void;
  resumeActiveCharging: (session: any) => void;
  syncActiveCharging: (syncPercent: number, syncKwh: number, logs: any[]) => void;
  updateActiveCharging: (consumedKwh: number, currentPercent: number, logs: any[]) => void;
  stopActiveCharging: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      currentUser: null,

      initAuth: () => {
        if (typeof window !== 'undefined') {
          const storedUser = localStorage.getItem('ev_user');
          if (storedUser) {
            const user = JSON.parse(storedUser);
            const userUid = user.UID || user.uid || user.Phone;
            set({
              isLoggedIn: true,
              currentUser: { ...user, UID: userUid },
              userProfile: {
                uid: userUid,
                name: user.Name || user.name || 'EV User',
                carPlate: user.CarPlate || '1T/6919',
                carImage: B10Profile.src,
                totalDistance: Number(user.TotalDistance) || 0,
              }
            });
          }
        }
      },

      setLogin: (user) => {
        console.log("=== API မှ ရလာသော User Data ===", user);
        const userUid = user.UID || user.uid || user.Phone;
        const userWithUid = { ...user, UID: userUid };
        localStorage.setItem('ev_user', JSON.stringify(userWithUid));

        const dist = Number(user.TotalDistance) || 0;
        console.log("=== Store ထဲ ထည့်မည့် Total Distance ===", dist);
        
        set({
          isLoggedIn: true,
          currentUser: userWithUid,
          userProfile: {
            uid: userUid,
            name: user.Name || 'EV User',
            carPlate: user.CarPlate || 'XX/XXXX',
            carImage: B10Profile.src,
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
        targetMins: 45,       // 👈 Default time
        limitMode: 'percent', // 👈 Default mode
        batteryCapacityKwh: 67.1,
        chargerKw: 30,
        isLeapmotorB10: true,
        pricePerKwh: 700,
        carsInQueue: 0,
        activePorts: 2,
        avgWaitTimePerCarMins: 10,
      },

      userProfile: {
        uid: "U-001",
        name: "EV Owner",
        carPlate: "1T/6919",
        carImage: B10Profile.src,
        totalDistance: 0,
      },
      setUserProfile: (profile) => set((state) => ({ userProfile: { ...state.userProfile, ...profile } })),

      favoriteStations: ["1695112125155x661458112083656700", "1700891204657x979318291489095700"],

      toggleFavorite: (stationId) => set((state) => {
        const isFav = state.favoriteStations.includes(stationId);
        return { favoriteStations: isFav ? state.favoriteStations.filter(id => id !== stationId) : [...state.favoriteStations, stationId] };
      }),

      setSelectedStation: (station) => set((state) => {
        if (!station) return { selectedStation: null }; // 👈 ဖျက်လိုက်ရင် Null ဖြစ်အောင်လုပ်ပေးမည်
        const portsCount = station._source?.port_details ? Object.keys(station._source.port_details).length : 1;
        const timeLimit = station._source?.charge_time_limit_mins;
        return {
          selectedStation: station,
          calcParams: {
            ...state.calcParams,
            chargerKw: station._source?.port_details?.port_A || state.calcParams.chargerKw,
            activePorts: portsCount,
            limitMode: timeLimit ? 'time' : 'percent',     // 👈 Station တွင် limit ပါလျှင် Time mode အော်တိုရွေးမည်
            targetMins: timeLimit ? timeLimit : state.calcParams.targetMins
          }
        };
      }),

      setGlobalAvgWaitMins: (avg) => set({ globalAvgWaitMins: avg }),
      updateCalcParams: (newParams) => set((state) => ({ calcParams: { ...state.calcParams, ...newParams } })),

      // ==========================================
      // Active Charging Session Logic
      // ==========================================
      activeSession: {
        id: null,
        isCharging: false,
        originalStartTime: null,
        originalStartPercent: 0,
        lastSyncTime: null,
        lastSyncPercent: 0,
        lastSyncKwh: 0,
        consumedKwh: 0,
        logs: [],
      },

      startActiveCharging: (id, startPercent) => {
        const now = new Date().toISOString();
        set({
          activeSession: {
            id: id,
            isCharging: true,
            originalStartTime: now,
            originalStartPercent: startPercent,
            lastSyncTime: now,
            lastSyncPercent: startPercent,
            lastSyncKwh: 0,
            consumedKwh: 0,
            logs: [{ time: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: startPercent, kwh: 0, isManual: true }]
          }
        });
      },

      resumeActiveCharging: (session) => set({
        activeSession: {
          id: session.id,
          isCharging: true,
          originalStartTime: session.originalStartTime,
          originalStartPercent: session.originalStartPercent,
          lastSyncTime: session.originalStartTime,
          lastSyncPercent: session.originalStartPercent,
          lastSyncKwh: 0,
          consumedKwh: 0,
          logs: session.logs
        }
      }),

      syncActiveCharging: (syncPercent, syncKwh, logs) => set((state) => ({
        activeSession: {
          ...state.activeSession,
          lastSyncTime: new Date().toISOString(),
          lastSyncPercent: syncPercent,
          lastSyncKwh: syncKwh,
          consumedKwh: syncKwh,
          logs: logs
        },
        calcParams: { ...state.calcParams, currentPercent: syncPercent }
      })),

      updateActiveCharging: (consumedKwh, currentPercent, logs) => set((state) => ({
        activeSession: { ...state.activeSession, consumedKwh, logs },
        calcParams: { ...state.calcParams, currentPercent }
      })),

      stopActiveCharging: () => set({
        activeSession: { id: null, isCharging: false, originalStartTime: null, originalStartPercent: 0, lastSyncTime: null, lastSyncPercent: 0, lastSyncKwh: 0, consumedKwh: 0, logs: [] }
      })
    }),
    {
      name: 'ev-planner-storage',
      partialize: (state) => ({
        activeSession: state.activeSession,
        calcParams: state.calcParams,
        favoriteStations: state.favoriteStations,
        // selectedStation: state.selectedStation 👈 ဖယ်လိုက်ပါပြီ (Refresh လုပ်တိုင်း အသစ်ကစမည်)
      }),
    }
  )
);
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { getNextEPCStatusChange, EPCStatus } from '../lib/epcSchedule';
import { fetchSheetData, appendSheetData } from '../services/api';
import { calculateCharging } from '../lib/chargingCalc';
import { Zap, ZapOff, BatteryCharging, MapPin, Car, Moon, Sun, CheckCircle, Activity, LayoutDashboard, Heart, Route, CreditCard, Calendar, History, Clock, TrendingUp, AlertTriangle, Search, ArrowUpDown, X, ShieldCheck, RefreshCw, User as UserIcon, LogOut, ChevronDown, List, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import dynamic from 'next/dynamic';
import { vehicleData } from '../data/vehicles';
import { stationData } from '../data/stations';
import { formatDuration } from '../lib/utils';
import { Info } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const StationMap = dynamic(() => import('../components/StationMap'), { ssr: false, loading: () => <div className="h-[400px] w-full bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">Map Loading...</div> });
const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}></div>;

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'planner' | 'dashboard' | 'profile'>('planner');

  // --- Auth States ---
  const { isLoggedIn, setLogin, logout, currentUser, userProfile, initAuth } = useAppStore();

  // 1. UID ပြဿနာ ဖြေရှင်းချက် (Google Sheet ထဲက U-xxx ပုံစံကိုပဲ သေချာယူမည်)
  const userUid = currentUser?.UID || currentUser?.uid || userProfile?.uid || 'UNKNOWN';

  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- Data Loading States ---
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // --- Planner States ---
  const [epcStatus, setEpcStatus] = useState<EPCStatus>('POWER_ON');
  const [nextTimeStr, setNextTimeStr] = useState<string>('');
  const [calcResult, setCalcResult] = useState<any>(null);

  const selectedStation = useAppStore((state) => state.selectedStation);
  const calcParams = useAppStore((state) => state.calcParams);
  const updateCalcParams = useAppStore((state) => state.updateCalcParams);
  const favoriteStations = useAppStore((state) => state.favoriteStations);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);

  // --- Queue & Charging States ---
  const [trackingQueue, setTrackingQueue] = useState(false);
  const [initialQueueCount, setInitialQueueCount] = useState(0);
  const [queueStartTime, setQueueStartTime] = useState<Date | null>(null);
  const [queueHistory, setQueueHistory] = useState<{ time: Date, remaining: number }[]>([]);

  const [isCharging, setIsCharging] = useState(false);
  const [chargingStartTime, setChargingStartTime] = useState<Date | null>(null);
  const [chargingLogs, setChargingLogs] = useState<{ time: string, percent: number, kwh: number, isManual: boolean }[]>([]);
  const [consumedKwh, setConsumedKwh] = useState<number>(0);
  const [energyLossKwh, setEnergyLossKwh] = useState<number>(0);
  const [syncPercentInput, setSyncPercentInput] = useState<string>('');
  const [syncKwhInput, setSyncKwhInput] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [finalReceiptData, setFinalReceiptData] = useState<any>(null);
  const [initialStartPercent, setInitialStartPercent] = useState(0);

  // --- Dropdown States ---
  const [stationSearch, setStationSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [stationModalInfo, setStationModalInfo] = useState<any | null>(null);

  // --- Dashboard Form States ---
  const [tripInput, setTripInput] = useState({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '' });
  const [statusInput, setStatusInput] = useState({ battery: '', range: '', soh: '' });

  // --- Logs States ---
  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [tripLogs, setTripLogs] = useState<any[]>([]);
  const [vehicleStatusLogs, setVehicleStatusLogs] = useState<any[]>([]);

  // --- History Table States ---
  const [historySearch, setHistorySearch] = useState('');
  const [historySortDesc, setHistorySortDesc] = useState(true);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<any | null>(null);

  // Helper: Phone number မှာ ' ပါနေရင် ဖယ်ထုတ်ပေးမည်
  const userIdentifier = (currentUser?.Phone || currentUser?.phone || "").toString().replace(/'/g, '').trim();

  // === 1. Initial Load & Fetching (Hydration Fix) ===
  useEffect(() => {
    initAuth();
    setMounted(true);
  }, [initAuth]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const queueData = await fetchSheetData('Queue_Logs');
        if (Array.isArray(queueData) && queueData.length > 0) {
          const totalAvg = queueData.reduce((sum: number, row: any) => sum + Number(row.Avg_Per_Car_Mins || 0), 0);
          if (Math.round(totalAvg / queueData.length) > 0) useAppStore.getState().setGlobalAvgWaitMins(Math.round(totalAvg / queueData.length));
        }

        // Charging Logs
        const cLogs = await fetchSheetData('Charging_Logs');
        if (Array.isArray(cLogs)) {
          const filteredCLogs = cLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setDashboardLogs(filteredCLogs);
        }

        // Trip Logs
        const tLogs = await fetchSheetData('Trip_Logs');
        if (Array.isArray(tLogs) && tLogs.length > 0) {
          const filteredTLogs = tLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setTripLogs(filteredTLogs);

          // Latest date ကနေ Month ကို အော်တို ရွေးပေးမည်
          if (filteredTLogs.length > 0) {
            const latestDateStr = filteredTLogs[filteredTLogs.length - 1]?.Date;
            if (latestDateStr) {
              const d = new Date(latestDateStr);
              if (!isNaN(d.getTime())) setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
          }
        }

        // Vehicle Status Logs
        const vLogs = await fetchSheetData('Vehicle_Status');
        if (Array.isArray(vLogs)) {
          const filteredVLogs = vLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setVehicleStatusLogs(filteredVLogs);
        }

      } catch (error) {
        console.error("Data Fetch Error: ", error);
        setInitialLoadError("အင်တာနက်ချိတ်ဆက်မှု ပြဿနာကြောင့် ဒေတာအချို့ ဆွဲယူ၍မရပါ။");
      } finally {
        setIsDataLoading(false);
      }
    };
    if (isLoggedIn && mounted && userUid !== 'UNKNOWN') fetchInitialData();
  }, [isLoggedIn, mounted, currentUser, userUid, userIdentifier]);

  // === Login Handler ===
  const handleLogin = async () => {
    const inputPhone = loginPhone.trim();
    if (!inputPhone.startsWith('09')) return alert("ဖုန်းနံပါတ်သည် 09 ဖြင့် စရပါမည်။");
    if (!inputPhone || !loginPin) return alert("Phone နှင့် PIN ထည့်ပါ။");

    setIsLoggingIn(true);
    try {
      const users = await fetchSheetData('Users');
      if (Array.isArray(users) && users.length > 0) {
        const found = users.find((u: any) => {
          const sheetPhone = String(u.Phone || u.phone).replace(/'/g, '').trim();
          const sheetPin = String(u.PIN || u.pin).trim();
          return sheetPhone === inputPhone && sheetPin === loginPin.trim();
        });

        if (found) {
          setLogin(found);
        } else {
          alert("ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်။");
        }
      } else {
        alert("Users Database မှတ်တမ်းမရှိသေးပါ။ (Google Sheet ကို စစ်ဆေးပါ)");
      }
    } catch (e) {
      alert("Login Error: " + String(e));
    }
    setIsLoggingIn(false);
  };

  // === EPC Time Updates ===
  useEffect(() => {
    setNextTimeStr(getNextEPCStatusChange(new Date(), epcStatus).toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }));
  }, [epcStatus]);

  // === Calculator Auto Updates ===
  useEffect(() => {
    if (calcResult || isCharging) {
      const baseTime = (trackingQueue && queueStartTime) ? queueStartTime : new Date();
      setCalcResult(calculateCharging({ ...calcParams, hasBackupPower: selectedStation?._source?.has_backup_power || false }, baseTime, epcStatus));
    }
  }, [calcParams, trackingQueue, queueStartTime, epcStatus, selectedStation]);

  // === Live Charging Simulator ===
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCharging && calcParams.currentPercent < calcParams.targetPercent) {
      let activeKw = (!calcParams.isLeapmotorB10 && calcParams.currentPercent >= 80) ? calcParams.chargerKw * 0.5 : calcParams.chargerKw;
      const kwhForOnePercent = calcParams.batteryCapacityKwh * 0.01 * 1.05;
      timer = setInterval(() => {
        const newPercent = calcParams.currentPercent + 1;
        const newConsumedKwh = consumedKwh + kwhForOnePercent;
        updateCalcParams({ currentPercent: newPercent });
        setConsumedKwh(newConsumedKwh);
        setChargingLogs(prev => [...prev, { time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: newPercent, kwh: Number(newConsumedKwh.toFixed(2)), isManual: false }]);
        if (newPercent >= calcParams.targetPercent) handleCompleteCharging(newPercent, newConsumedKwh);
      }, Math.round((kwhForOnePercent / activeKw) * 3600 * 1000));
    }
    return () => clearInterval(timer);
  }, [isCharging, calcParams.currentPercent, calcParams.targetPercent, calcParams.chargerKw, calcParams.batteryCapacityKwh, calcParams.isLeapmotorB10, consumedKwh]);

  // --- Button Handlers ---
  const handleCalculate = () => setCalcResult(calculateCharging({ ...calcParams, hasBackupPower: selectedStation?._source?.has_backup_power || false }, (trackingQueue && queueStartTime) ? queueStartTime : new Date(), epcStatus));

  const startQueueTracking = () => {
    if (!selectedStation) return alert("Station တစ်ခုကို ရွေးချယ်ပေးပါ။");
    if (calcParams.carsInQueue <= 0) return alert("ကားအနည်းဆုံး ၁ စီး ရှိရပါမည်။");
    const now = new Date(); setTrackingQueue(true); setInitialQueueCount(calcParams.carsInQueue); setQueueStartTime(now); setQueueHistory([{ time: now, remaining: calcParams.carsInQueue }]);
  };

  const handleCarLeft = async () => {
    const remainingCars = Math.max(0, calcParams.carsInQueue - 1);
    const now = new Date(); updateCalcParams({ carsInQueue: remainingCars }); setQueueHistory(prev => [...prev, { time: now, remaining: remainingCars }]);
    if (remainingCars === 0 && queueStartTime) {
      setTrackingQueue(false);
      const safeTotalMins = Math.max(1, Math.round((now.getTime() - queueStartTime.getTime()) / 60000));
      try { await appendSheetData('Queue_Logs', [`Q-${Date.now()}`, userUid, now.toLocaleString(), selectedStation._source.name_text, initialQueueCount, safeTotalMins, Math.round(safeTotalMins / initialQueueCount)]); } catch (e) { }
      alert(`သင့်အလှည့်ရောက်ပါပြီ! အားစသွင်းနိုင်ပါပြီ။`);
    }
  };

  const startCharging = () => {
    if (!selectedStation) return alert("Station အရင်ရွေးပါ။");
    setInitialStartPercent(calcParams.currentPercent); setIsCharging(true); setConsumedKwh(0); setEnergyLossKwh(0); setChargingStartTime(new Date());
    setChargingLogs([{ time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: calcParams.currentPercent, kwh: 0, isManual: true }]);
  };

  const handleSyncData = () => {
    let newPercent = Number(syncPercentInput) || calcParams.currentPercent;
    let newKwh = Number(syncKwhInput) || consumedKwh;
    if (newPercent > 0 || newKwh > 0) {
      updateCalcParams({ currentPercent: newPercent }); setConsumedKwh(newKwh);
      setEnergyLossKwh(Math.max(0, newKwh - (((newPercent - initialStartPercent) / 100) * calcParams.batteryCapacityKwh)));
      setChargingLogs(prev => [...prev, { time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: newPercent, kwh: Number(newKwh.toFixed(2)), isManual: true }]);
      setSyncPercentInput(''); setSyncKwhInput('');
    }
  };

  const handleCompleteCharging = async (finalPercent = calcParams.currentPercent, finalKwh = consumedKwh) => {
    setIsCharging(false); setShowReceipt(true);
    const finalData = {
      station: selectedStation?._source?.name_text, vehicle: vehicleData.find(v => v.id === calcParams.vehicleId)?.brand + " " + vehicleData.find(v => v.id === calcParams.vehicleId)?.model,
      startPercent: initialStartPercent, endPercent: finalPercent, kwh: Number(finalKwh.toFixed(2)), lossKwh: Number(energyLossKwh.toFixed(2)),
      actualMins: chargingStartTime ? Math.round((new Date().getTime() - chargingStartTime.getTime()) / 60000) : 0, predictedDuration: calcResult?.chargeDurationStr || '-',
      cost: Math.round(finalKwh * calcParams.pricePerKwh), date: new Date().toLocaleString(), timelineJson: JSON.stringify(chargingLogs.filter(log => log.isManual))
    };
    setFinalReceiptData(finalData);
    try {
      await appendSheetData('Charging_Logs', [`C-${Date.now()}`, userUid, finalData.date, finalData.station, finalData.vehicle, finalData.startPercent, finalData.endPercent, finalData.kwh, finalData.lossKwh, finalData.actualMins, finalData.predictedDuration, finalData.cost, finalData.timelineJson, 'Completed']);
      setDashboardLogs(prev => [...prev, { Date: finalData.date, Station_Name: finalData.station, Consumed_kWh: finalData.kwh, Cost: finalData.cost, Start_Percent: finalData.startPercent, End_Percent: finalData.endPercent, Timeline_Data: finalData.timelineJson }]);
    } catch (e) { }
  };


  const handleSaveTripLog = async () => {
    if (!tripInput.distance || !tripInput.avgKwh || !tripInput.remainingPercent) return alert("အချက်အလက်များ အပြည့်အစုံထည့်ပါ။");
    const usedKwh = (Number(tripInput.distance) / 100) * Number(tripInput.avgKwh);
    const tripDataObj = {
      ID: `T-${Date.now()}`, UID: userUid, Date: new Date().toLocaleString(), Distance_km: Number(tripInput.distance),
      Duration: `${Number(tripInput.durationHr) || 0}hr ${Number(tripInput.durationMin) || 0}mins`, Avg_Consumption: Number(tripInput.avgKwh), Used_kWh: Number(usedKwh.toFixed(2)),
      Efficiency: Number((100 / Number(tripInput.avgKwh)).toFixed(2)), Remaining_Percent: Number(tripInput.remainingPercent)
    };
    try {
      await appendSheetData('Trip_Logs', Object.values(tripDataObj)); setTripLogs(prev => [...prev, tripDataObj]); alert(`Trip မှတ်တမ်းတင်ပြီးပါပြီ!`); setTripInput({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  const handleSaveVehicleStatus = async () => {
    if (!statusInput.battery || !statusInput.range || !statusInput.soh) return alert("အချက်အလက်များ အပြည့်အစုံထည့်ပါ။");
    const statusData = { ID: `V-${Date.now()}`, UID: userUid, Date: new Date().toLocaleString(), Battery_Percent: Number(statusInput.battery), Dash_Range_km: Number(statusInput.range), SOH_Percent: Number(statusInput.soh) };
    try {
      await appendSheetData('Vehicle_Status', Object.values(statusData)); setVehicleStatusLogs(prev => [...prev, statusData]); alert(`ကား ဒေတာ Sync လုပ်ပြီးပါပြီ!`); setStatusInput({ battery: '', range: '', soh: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  // ==========================================
  // Analytics & Reset Logic
  // ==========================================
  const dashboardStats = useMemo(() => {
    // Selected Month ကို သေချာ Format ချထားမည်
    const rawSelected = selectedMonth || new Date().toISOString().substring(0, 7);

    const safeDateParse = (dStr: any) => {
      if (!dStr) return null;
      try {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } catch (e) { return null; }
    };

    const currentMonthFilter = safeDateParse(rawSelected);

    const getT = (log: any) => {
      if (!log) return 0;
      const dStr = log.Date || log.Time || log['Date & Time'];
      if (!dStr) return 0;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };


    // --- 1. Unified Timeline Logic ---
    const unifiedTimeline: any[] = [];

    tripLogs.forEach(t => {
      const tTime = getT(t);
      if (tTime > 0) unifiedTimeline.push({ type: 'TRIP', time: tTime, data: t });
    });

    dashboardLogs.forEach(c => {
      const cTime = getT(c);
      if (cTime > 0 && (c.Status === 'Completed' || !c.Status)) {
        unifiedTimeline.push({ type: 'CHARGE', time: cTime, data: c });
      }
    });

    // အချိန် အဟောင်းမှ အသစ်သို့ စီမည်
    unifiedTimeline.sort((a, b) => a.time - b.time);

    let baselineKm = 0;
    const processedTrips: any[] = [];

    unifiedTimeline.forEach(event => {
      if (event.type === 'CHARGE') {
        // အားသွင်းလျှင် စမှတ်ကို 0 သို့ Reset ချမည်
        baselineKm = 0;
      } else if (event.type === 'TRIP') {
        const currentOdo = Number(event.data.Distance_km || event.data.Distance || event.data['Distance (km)'] || 0);
        let actualDist = currentOdo - baselineKm;

        // အမှားအယွင်းကြောင့် အနုတ်ပြနေလျှင် currentOdo အတိုင်းပဲယူမည်
        if (actualDist < 0) actualDist = currentOdo;

        processedTrips.push({
          ...event.data,
          actual_dist: actualDist,
          parsedMonth: safeDateParse(event.data.Date || event.data.Time)
        });

        // နောက် Trip တစ်ခုအတွက် စမှတ်ကို လက်ရှိ Odo သို့ ပြောင်းမည်
        baselineKm = currentOdo;
      }
    });

    // --- 2. Filter & Summation ---
    const monthTrips = processedTrips.filter(t => t.parsedMonth === currentMonthFilter);
    const monthCharges = dashboardLogs.filter(c => safeDateParse(c.Date || c.Time || c['Date & Time']) === currentMonthFilter);

    // Actual Distance အမှန်ကို ပေါင်းမည်
    const totalDist = monthTrips.reduce((sum, t) => sum + t.actual_dist, 0);
    const totalUsedKwh = monthTrips.reduce((sum, t) => sum + Number(t.Used_kWh || t.UsedkWh || t['Used kWh'] || 0), 0);
    const totalRecharged = monthCharges.reduce((sum, c) => sum + Number(c.Consumed_kWh || c.ConsumedkWh || c['Consumed kWh'] || c.kwh || 0), 0);
    const totalSpent = monthCharges.reduce((sum, c) => sum + Number(c.Cost || c.Total_Cost || c['Total Cost'] || 0), 0);

    // --- 3. Battery Status Logic ---
    const MAX_RANGE_KM = 440.22;
    const autoSOH = Math.max(80, 100 - (userProfile.totalDistance / 20000));

    const lTrip = tripLogs[tripLogs.length - 1];
    const lCharge = dashboardLogs[dashboardLogs.length - 1];
    const lStatus = vehicleStatusLogs[vehicleStatusLogs.length - 1];
    const maxTime = Math.max(getT(lTrip), getT(lCharge), getT(lStatus));

    let currentBattery = 0;
    let currentRange = 0;
    let rangeSource = "Estimated";
    let currentSOH = autoSOH;

    if (maxTime > 0) {
      if (getT(lStatus) === maxTime && lStatus) {
        currentBattery = Number(lStatus.Battery_Percent || lStatus.Battery || 0);
        currentRange = Number(lStatus.Dash_Range_km || lStatus.Range || 0);
        currentSOH = Number(lStatus.SOH_Percent || lStatus.SOH || autoSOH);
        rangeSource = "Car Sync";
      } else if (getT(lTrip) === maxTime && lTrip) {
        currentBattery = Number(lTrip.Remaining_Percent || lTrip['Remaining Percent'] || 0);
        rangeSource = "Since Last Charge";
      } else if (getT(lCharge) === maxTime && lCharge) {
        currentBattery = Number(lCharge.End_Percent || lCharge['End%'] || 0);
        rangeSource = "Last Charged";
      }
    }

    if (currentBattery === 0) currentBattery = calcParams.currentPercent;

    if (rangeSource !== "Car Sync") {
      currentRange = (currentBattery / 100) * MAX_RANGE_KM * (currentSOH / 100);
    }

    const dailyAvgKm = monthTrips.length > 1 ? (totalDist / monthTrips.length) : 30;
    const daysUntilCharge = dailyAvgKm > 0 ? (currentRange / dailyAvgKm) : 0;
    const nextChargeDate = new Date(Date.now() + daysUntilCharge * 24 * 60 * 60 * 1000);

    let batColor = "from-green-500 to-green-700 border-green-500";
    if (currentBattery < 30) batColor = "from-red-500 to-red-700 border-red-500";
    else if (currentBattery < 40) batColor = "from-yellow-400 to-yellow-600 border-yellow-400";
    else if (currentBattery < 60) batColor = "from-orange-400 to-orange-600 border-orange-400";

    return { totalDist, totalUsedKwh, totalRecharged, totalSpent, currentBattery, currentRange, rangeSource, currentSOH, nextChargeDate, batColor, autoSOH, processedTrips };
  }, [tripLogs, dashboardLogs, vehicleStatusLogs, selectedMonth, calcParams.batteryCapacityKwh, calcParams.currentPercent, userProfile.totalDistance]);


  useEffect(() => {
    if (dashboardStats.currentBattery > 0 && !isCharging) {
      updateCalcParams({ currentPercent: dashboardStats.currentBattery });
    }
  }, [dashboardStats.currentBattery, isCharging, updateCalcParams]);

  const sortedHistoryLogs = useMemo(() => {
    return dashboardLogs
      .filter(log => {
        // Date & Time ဆိုတဲ့ key ကို သုံးပြီး စစ်မယ်
        const dateVal = log['Date & Time'] || log.Date || log.Time || '';
        return String(dateVal).toLowerCase().includes(historySearch.toLowerCase());
      })
      .sort((a, b) => {
        const valA = Number(a.Consumed_kWh || a.ConsumedkWh || a['Consumed kWh'] || a.kwh || 0);
        const valB = Number(b.Consumed_kWh || b.ConsumedkWh || b['Consumed kWh'] || b.kwh || 0);
        return historySortDesc ? valB - valA : valA - valB;
      });
  }, [dashboardLogs, historySearch, historySortDesc]);

  const filteredStations = stationData.hits.hits.filter(s => s._source.name_text.toLowerCase().includes(stationSearch.toLowerCase()));

  // ==========================================
  // UI Render
  // ==========================================
  if (!mounted) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-gray-100 dark:border-gray-700">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-sm"><Car size={40} className="text-blue-600 dark:text-blue-400" /></div>
          <h2 className="text-2xl font-black mb-2 text-gray-800 dark:text-white">EV Smart Planner</h2>
          <p className="text-gray-500 mb-8 text-sm">Please login to access your dashboard</p>
          <input type="text" placeholder="Phone Number" className="w-full border p-4 rounded-xl mb-4 dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition" value={loginPhone} onChange={e => setLoginPhone(e.target.value)} />
          <input type="password" placeholder="PIN (Try: 1234)" className="w-full border p-4 rounded-xl mb-8 dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 transition" value={loginPin} onChange={e => setLoginPin(e.target.value)} />
          <button onClick={handleLogin} disabled={isLoggingIn} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
            {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "Secure Login"}
          </button>
        </div>
      </div>
    );
  }



  return (
    <main className="min-h-screen pb-24 md:pb-12 bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100 relative">
      {/* Desktop Navbar */}
      <nav className="hidden md:flex bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto w-full px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">EV Planner</h1>
          <div className="flex gap-6 items-center">
            <button onClick={() => setActiveTab('planner')} className={`font-bold transition ${activeTab === 'planner' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Planner</button>
            <button onClick={() => setActiveTab('dashboard')} className={`font-bold transition ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Dashboard</button>
            <button onClick={() => setActiveTab('profile')} className={`font-bold transition ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Profile</button>
            {mounted && <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="ml-4 p-2 bg-gray-100 dark:bg-gray-700 rounded-full">{theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}</button>}
          </div>
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">EV Planner</h1>
        {mounted && <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">{theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}</button>}
      </div>

      {initialLoadError && <div className="max-w-4xl mx-auto mt-4 px-4"><div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm flex gap-2 items-center"><AlertTriangle size={18} /> {initialLoadError}</div></div>}

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">

        {/* TAB 1: PLANNER */}
        {activeTab === 'planner' && (
          <div className="space-y-8">
            {!isCharging && !showReceipt && (
              <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white"><MapPin className="text-red-500" /> EV Stations Map</h2>
                <StationMap />
              </section>
            )}

            {isCharging && (
              <section className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-lg border border-blue-200 dark:border-blue-800 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse"></div>
                <h2 className="text-2xl font-black mb-2 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400"><BatteryCharging size={28} className="animate-bounce" /> အားသွင်းနေပါသည်...</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">{selectedStation?._source?.name_text}</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-blue-50 dark:bg-gray-900 p-5 rounded-2xl shadow-inner border border-blue-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Charger Speed</p>
                    <p className="font-black text-2xl text-blue-600 dark:text-blue-400 mt-1">{calcParams.chargerKw} <span className="text-sm font-normal">kW</span></p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-5 rounded-2xl shadow-inner border border-green-100 dark:border-green-800/50">
                    <p className="text-xs text-green-700 dark:text-green-500 font-bold uppercase tracking-wider">စားသုံးပြီးသော စွမ်းအင်</p>
                    <p className="font-black text-2xl text-green-600 dark:text-green-400 mt-1">{consumedKwh.toFixed(2)} <span className="text-sm font-normal">kWh</span></p>
                  </div>
                </div>

                <div className="flex justify-center items-center mb-8">
                  <div className="relative w-56 h-56 rounded-full border-[10px] border-gray-100 dark:border-gray-800 flex items-center justify-center shadow-inner">
                    <div className="absolute top-0 left-0 w-full h-full rounded-full border-[10px] border-green-500 transition-all duration-1000" style={{ clipPath: `polygon(50% 50%, 50% 0%, ${calcParams.currentPercent > 25 ? '100% 0%,' : ''} ${calcParams.currentPercent > 50 ? '100% 100%,' : ''} ${calcParams.currentPercent > 75 ? '0% 100%,' : ''} 0% 0%)` }}></div>
                    <div className="text-6xl font-black text-green-600 dark:text-green-400 z-10">{calcParams.currentPercent}%</div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl mb-6 flex justify-between items-center text-left border border-gray-200 dark:border-gray-800">
                  <div><p className="text-xs text-gray-500 font-bold uppercase mb-1">ကျန်ရှိချိန်</p><p className="font-black text-xl">{calcResult?.chargeDurationStr}</p></div>
                  <div className="text-right"><p className="text-xs text-gray-500 font-bold uppercase mb-1">ပြီးဆုံးမည့် အချိန်</p><p className="font-black text-xl text-blue-600 dark:text-blue-400">{calcResult?.finishTimeStr}</p></div>
                </div>

                {energyLossKwh > 0 && <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm text-left">⚠️ ကားနှင့် Charger ကြား စွမ်းအင်အလေအလွင့် (Efficiency Loss): <strong>{energyLossKwh.toFixed(2)} kWh</strong> ရှိနေပါသည်။</div>}

                <div className="bg-yellow-50 dark:bg-yellow-900/10 p-5 rounded-2xl border border-yellow-200 dark:border-yellow-800/50 mb-8 text-left">
                  <p className="font-bold text-yellow-800 dark:text-yellow-500 flex items-center gap-2 mb-4"><RefreshCw size={18} /> Manual Sync ပြုလုပ်ရန်</p>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input type="number" placeholder="ကားစခရင်မှ %" className="flex-1 border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={syncPercentInput} onChange={(e) => setSyncPercentInput(e.target.value)} />
                    <input type="number" placeholder="Charger မှ kWh" className="flex-1 border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={syncKwhInput} onChange={(e) => setSyncKwhInput(e.target.value)} />
                    <button onClick={handleSyncData} className="bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-3 rounded-xl font-bold shadow-md transition">Sync</button>
                  </div>
                </div>

                <button onClick={() => handleCompleteCharging(calcParams.currentPercent, consumedKwh)} className="w-full bg-red-500 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-red-600 transition">အားသွင်းခြင်း ရပ်မည် (Stop)</button>
              </section>
            )}

            {showReceipt && finalReceiptData && (
              <section className="bg-white dark:bg-gray-800 p-8 md:p-10 rounded-3xl shadow-xl border border-green-200 dark:border-green-800">
                <div className="text-center mb-10">
                  <CheckCircle size={70} className="text-green-500 mx-auto mb-4" />
                  <h2 className="text-3xl font-black text-gray-800 dark:text-white">အားသွင်းခြင်း ပြီးဆုံးပါပြီ</h2>
                  <p className="text-gray-500 font-medium mt-2">{finalReceiptData.date}</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 p-6 md:p-8 rounded-2xl mb-8 space-y-4 shadow-inner border border-gray-100 dark:border-gray-800">
                  <h3 className="font-black text-lg border-b pb-3 dark:border-gray-700 dark:text-white mb-4">Payment Receipt</h3>
                  <div className="flex justify-between"><span className="text-gray-500 font-medium">Station</span><span className="font-bold text-right">{finalReceiptData.station}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 font-medium">Vehicle</span><span className="font-bold text-right">{finalReceiptData.vehicle}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 font-medium">Battery</span><span className="font-bold">{finalReceiptData.startPercent}% ➔ {finalReceiptData.endPercent}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 font-medium">Consumed Energy</span><span className="font-black text-blue-600 dark:text-blue-400">{finalReceiptData.kwh} kWh</span></div>
                  {finalReceiptData.lossKwh > 0 && <div className="flex justify-between"><span className="text-red-500 font-medium">Efficiency Loss</span><span className="font-bold text-red-500">{finalReceiptData.lossKwh} kWh</span></div>}
                  <div className="flex justify-between text-xl font-black pt-5 border-t dark:border-gray-700 text-green-600 dark:text-green-400 mt-2"><span>စုစုပေါင်း ကျသင့်ငွေ</span><span>{finalReceiptData.cost.toLocaleString()} Ks</span></div>
                </div>

                <h3 className="font-bold text-lg mb-4 dark:text-white flex items-center gap-2"><Activity size={20} className="text-blue-500" /> အားသွင်းမှု မှတ်တမ်း (Timeline)</h3>
                <div className="h-64 w-full mb-8 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chargingLogs}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="time" fontSize={12} />
                      <YAxis yAxisId="left" domain={[0, 100]} stroke="#10B981" fontSize={12} />
                      <YAxis yAxisId="right" orientation="right" stroke="#3B82F6" fontSize={12} />
                      <Tooltip contentStyle={{ borderRadius: '12px', backgroundColor: '#1F2937', color: '#fff', border: 'none' }} />
                      <Line yAxisId="left" name="Battery %" type="monotone" dataKey="percent" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                      <Line yAxisId="right" name="Consumed kWh" type="monotone" dataKey="kwh" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <button onClick={() => { setShowReceipt(false); setChargingLogs([]); }} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition">ပင်မစာမျက်နှာသို့ ပြန်သွားမည်</button>
              </section>
            )}

            {!isCharging && !showReceipt && (
              <section className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-2xl font-black mb-6 flex items-center gap-2 dark:text-white"><BatteryCharging className="text-green-500" /> Charging Calculator</h2>

                <div className="relative mb-6">
                  <label className="block text-sm font-bold mb-2 text-gray-500">Station ရွေးချယ်ရန်</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input type="text" placeholder="Station အမည်ဖြင့် ရှာဖွေပါ..." className="w-full border p-3 pl-10 pr-10 rounded-xl dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium transition" value={stationSearch} onChange={(e) => { setStationSearch(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} />
                    <ChevronDown className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18} />
                  </div>
                  {isDropdownOpen && (
                    <ul className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                      {filteredStations.map(s => (
                        <li key={s._id} className="p-4 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 last:border-0 flex justify-between items-center"
                          onClick={() => {
                            useAppStore.getState().setSelectedStation(s);
                            setStationSearch(s._source.name_text);
                            setIsDropdownOpen(false);
                            if (s._source?.has_backup_power) {
                              setEpcStatus('POWER_ON');
                            }
                          }}>
                          <div><p className="font-bold dark:text-white">{s._source.name_text}</p><p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]">{s._source.address_text}</p></div>
                          <button onClick={(e) => { e.stopPropagation(); setStationModalInfo(s); }} className="text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-lg text-xs font-bold">Detail</button>
                        </li>
                      ))}
                      {filteredStations.length === 0 && <li className="p-4 text-center text-gray-500">ရှာမတွေ့ပါ</li>}
                    </ul>
                  )}
                </div>

                {selectedStation && (
                  <div className="mb-6 p-4 bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-2xl flex items-start gap-4 shadow-inner">
                    <div className="bg-green-100 dark:bg-green-800 p-3 rounded-xl"><MapPin className="text-green-600 dark:text-green-300" size={24} /></div>
                    <div className="flex-1">
                      <p className="font-black text-green-900 dark:text-green-100 text-lg">{selectedStation._source.name_text}</p>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400 mt-1">Speed: {selectedStation._source.station__ac_dc__option_ac_dc_station?.toUpperCase()} • {selectedStation._source.price_text} Ks</p>
                      {selectedStation._source.has_backup_power && <span className="inline-block mt-2 bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100 text-xs px-2 py-1 rounded font-bold shadow-sm">✓ 24 Hours လျှပ်စစ်မီးရရှိသည်</span>}
                    </div>
                    <button onClick={() => toggleFavorite(selectedStation._id)} className={`p-3 rounded-full transition-colors shadow-sm ${favoriteStations.includes(selectedStation._id) ? 'bg-red-100 text-red-500' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50'}`}>
                      <Heart size={20} fill={favoriteStations.includes(selectedStation._id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )}

                <div className="mb-8 p-5 rounded-2xl border border-blue-100 dark:border-gray-700 bg-blue-50/30 dark:bg-gray-800/50">
                  <label className="block text-sm font-bold mb-3 dark:text-gray-300">လက်ရှိ လျှပ်စစ်မီး အခြေအနေ</label>
                  <div className={`flex gap-4 transition-all duration-300 ${selectedStation?._source?.has_backup_power ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <button disabled={selectedStation?._source?.has_backup_power} onClick={() => setEpcStatus('POWER_ON')} className={`flex-1 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-sm ${epcStatus === 'POWER_ON' ? 'bg-green-500 text-white ring-4 ring-green-500/30' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border dark:border-gray-700'}`}><Zap size={20} /> မီးလာနေသည်</button>
                    <button disabled={selectedStation?._source?.has_backup_power} onClick={() => setEpcStatus('POWER_OFF')} className={`flex-1 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-sm ${epcStatus === 'POWER_OFF' ? 'bg-red-500 text-white ring-4 ring-red-500/30' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border dark:border-gray-700'}`}><ZapOff size={20} /> မီးပျက်နေသည်</button>
                  </div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-4 text-center bg-white/50 dark:bg-gray-900/50 py-2 rounded-lg">
                    {selectedStation?._source?.has_backup_power
                      ? (<span className="text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-1">
                        <AlertTriangle size={14} /> ✓ Backup Power ရှိသောကြောင့် EPC မီးအခြေအနေ ရွေးရန်မလိုပါ။
                      </span>)
                      : `(နောက်တစ်ကြိမ် မီးပြောင်းလဲမည့်အချိန်: ${nextTimeStr})`
                    }
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">ကားအမျိုးအစား (Vehicle Model)</label>
                    <select className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium" value={calcParams.vehicleId || ""} onChange={(e) => { const car = vehicleData.find(v => v.id === e.target.value); if (car) updateCalcParams({ vehicleId: e.target.value, batteryCapacityKwh: car.batteryKwh, isLeapmotorB10: car.isLeapmotor }); }}>
                      {vehicleData.map(car => <option key={car.id} value={car.id}>{car.brand} {car.model} ({car.batteryKwh} kWh)</option>)}
                    </select>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Battery Capacity (kWh)</label><input type="number" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.batteryCapacityKwh} onChange={e => updateCalcParams({ batteryCapacityKwh: Number(e.target.value) })} /></div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Charger Speed (kW)</label>
                    <select className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.chargerKw} onChange={e => updateCalcParams({ chargerKw: Number(e.target.value) })}>
                      <option value={30}>30 kW</option><option value={40}>40 kW</option><option value={50}>50 kW</option><option value={60}>60 kW</option><option value={120}>120 kW</option>
                    </select>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">တစ်ပြိုင်နက်သွင်းနိုင်သော အစီးအရေ</label><input type="number" min="1" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.activePorts} onChange={e => updateCalcParams({ activePorts: Math.max(1, Number(e.target.value)) })} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">ရှေ့တွင်စောင့်နေသော ကား (စီး)</label><input type="number" min="0" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.carsInQueue} onChange={e => updateCalcParams({ carsInQueue: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Current Battery %</label><input type="number" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.currentPercent} onChange={e => updateCalcParams({ currentPercent: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Target Battery %</label><input type="number" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-black text-green-600 outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.targetPercent} onChange={e => updateCalcParams({ targetPercent: Number(e.target.value) })} /></div>
                </div>

                <button onClick={handleCalculate} className="w-full bg-gray-900 dark:bg-gray-700 text-white py-4 rounded-xl hover:bg-gray-800 transition font-black shadow-lg text-lg">ခန့်မှန်းချက် တွက်မည်</button>

                {calcParams.carsInQueue > 0 && !trackingQueue ? (
                  <button onClick={startQueueTracking} className="w-full mt-4 bg-orange-500 text-white py-4 rounded-xl hover:bg-orange-600 font-black shadow-lg text-lg">စတင်စောင့်ဆိုင်းမည် (Start Queue)</button>
                ) : calcParams.carsInQueue === 0 && !trackingQueue ? (
                  <button onClick={startCharging} className="w-full mt-4 bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-700 font-black shadow-lg flex justify-center items-center gap-2 text-lg"><BatteryCharging size={24} /> အားစသွင်းမည်</button>
                ) : null}

                {trackingQueue && calcParams.carsInQueue > 0 && (
                  <div className="mt-6 p-6 border-2 border-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-2xl text-center shadow-inner">
                    <p className="mb-4 text-orange-800 dark:text-orange-200 font-bold text-lg">ရှေ့တွင် <strong>{calcParams.carsInQueue}</strong> စီး ကျန်ပါသေးသည်...</p>
                    <button onClick={handleCarLeft} className="w-full sm:w-auto bg-orange-500 text-white px-8 py-4 rounded-xl font-black shadow-md hover:bg-orange-600 transition-transform active:scale-95">👇 ရှေ့ကားတစ်စီး ထွက်သွားပြီ (-1)</button>
                  </div>
                )}

                {calcResult && (
                  <div className="mt-10 p-6 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-inner">
                    <h3 className="font-black text-xl mb-6 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-4">ခန့်မှန်းခြေ အချိန်စာရင်း (Estimation Details)</h3>
                    {calcResult.blackoutMins > 0 && <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl text-red-700 text-sm font-bold flex gap-2"><AlertTriangle size={18} className="shrink-0" /> EPC မီးပျက်ချိန် {formatDuration(calcResult.blackoutMins / 60)} ပါဝင်သွားသဖြင့် အချိန်ပိုကြာပါမည်။</div>}
                    <div className="space-y-5 text-sm md:text-base font-medium text-gray-600 dark:text-gray-300">
                      <div className="flex justify-between items-center"><span className="flex items-center gap-2"><Clock size={18} /> ကားစောင့်ရမည့် ကြာချိန်</span><span className="font-black text-orange-500 text-lg bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-lg">{calcResult.waitDurationStr}</span></div>
                      <div className="flex justify-between items-center"><span className="flex items-center gap-2"><Calendar size={18} /> အားစသွင်းရမည့် အချိန်</span><span className="font-black text-gray-800 dark:text-white text-lg">{calcResult.startTimeStr}</span></div>
                      <div className="flex justify-between items-center"><span className="flex items-center gap-2"><BatteryCharging size={18} /> အားသွင်းကြာချိန်</span><span className="font-black text-blue-600 text-lg bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-lg">{calcResult.chargeDurationStr}</span></div>
                      <div className="flex justify-between items-center pt-5 border-t border-gray-200 dark:border-gray-700"><span className="font-black text-gray-800 dark:text-white">ပြီးဆုံးမည့် အချိန် (Finish)</span><span className="text-xl font-black text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-4 py-1.5 rounded-xl">{calcResult.finishTimeStr}</span></div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* TAB 2: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <section className="space-y-8">
            {isDataLoading ? <Skeleton className="h-48 w-full rounded-3xl" /> : (
              <div className={`bg-gradient-to-br ${dashboardStats.batColor} rounded-3xl shadow-2xl p-8 text-white relative overflow-hidden border-4 border-white/20 dark:border-gray-800`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 relative z-10">
                  <div>
                    <p className="text-white/80 font-bold uppercase tracking-wider text-xs mb-2">လက်ရှိ Battery အခြေအနေ</p>
                    <div className="flex items-end gap-2"><span className="text-7xl font-black leading-none tracking-tighter">{dashboardStats.currentBattery}%</span></div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-white/80 font-bold uppercase tracking-wider text-xs mb-2">သွားနိုင်မည့် ခန့်မှန်းအကွာအဝေး</p>
                    <p className="text-5xl font-black leading-none tracking-tighter mb-2">{Math.round(dashboardStats.currentRange)} <span className="text-2xl font-bold">km</span></p>
                    <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-sm border border-white/30 ${dashboardStats.rangeSource === 'Car Sync' ? 'bg-green-500/80 text-white' : 'bg-black/30 text-white/90'}`}>
                      <Info size={10} className="inline mr-1" /> {dashboardStats.rangeSource === 'Car Sync' ? 'လက်တွေ့ (Car Sync)' : 'ခန့်မှန်း (Estimated)'}
                    </span>
                  </div>
                </div>
                <div className="bg-black/20 p-5 rounded-2xl backdrop-blur-md border border-white/10 flex items-center gap-4 relative z-10 shadow-inner">
                  <div className="bg-white/20 p-3 rounded-xl"><Calendar className="text-white" size={24} /></div>
                  <div>
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">နောက်တစ်ကြိမ် အားသွင်းရန် (20% Limit)</p>
                    <p className="font-black text-xl">{dashboardStats.nextChargeDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>
              </div>
            )}

            {!isDataLoading && (
              <div className={`p-6 rounded-3xl flex items-start gap-4 shadow-sm border-2 ${dashboardStats.autoSOH < 95 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/50' : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50'}`}>
                <div className={`p-3 rounded-2xl ${dashboardStats.autoSOH < 95 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <h4 className={`font-black text-lg ${dashboardStats.autoSOH < 95 ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300'}`}>Battery Health Advisory (SOH: {Math.round(dashboardStats.autoSOH)}%)</h4>
                  <p className={`text-sm font-medium mt-2 leading-relaxed ${dashboardStats.autoSOH < 95 ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                    {dashboardStats.autoSOH < 95
                      ? "SOH အနည်းငယ် ကျဆင်းနေပါသည်။ Fast Charging သုံးစွဲမှုကို လျှော့ချပြီး AC (Slow Charge) ကို ပိုမိုအသုံးပြုရန် အကြံပြုအပ်ပါသည်။"
                      : "Battery ကျန်းမာရေး အလွန်ကောင်းမွန်ပါသည်။ 20% အောက် မရောက်ခင် အားသွင်းသည့် အလေ့အကျင့်ကို ဆက်ထိန်းပါ။"}
                  </p>
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-6 px-2">
                <h3 className="font-black text-xl dark:text-white flex items-center gap-2"><Calendar size={22} className="text-blue-500" /> အသုံးပြုမှု မှတ်တမ်း</h3>
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 font-black px-4 py-2 rounded-xl shadow-sm outline-none cursor-pointer hover:border-blue-500 transition" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {isDataLoading ? (
                  <><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /></>
                ) : (
                  <>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between"><div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4"><Route className="text-blue-500" size={20} /></div><div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">ခရီးစဉ်အကွာအဝေး</p><p className="text-2xl font-black dark:text-white mt-1">{dashboardStats.totalDist.toLocaleString()} <span className="text-sm font-bold text-gray-400">km</span></p></div></div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between"><div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4"><ZapOff className="text-orange-500" size={20} /></div><div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">သုံးစွဲခဲ့သော စွမ်းအင်</p><p className="text-2xl font-black dark:text-white mt-1">{dashboardStats.totalUsedKwh.toFixed(1)} <span className="text-sm font-bold text-gray-400">kWh</span></p></div></div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between"><div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4"><BatteryCharging className="text-green-500" size={20} /></div><div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">အားပြန်သွင်းမှု</p><p className="text-2xl font-black dark:text-white mt-1">{dashboardStats.totalRecharged.toFixed(1)} <span className="text-sm font-bold text-gray-400">kWh</span></p></div></div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between"><div className="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4"><CreditCard className="text-red-500" size={20} /></div><div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">ကုန်ကျစရိတ်</p><p className="text-2xl font-black dark:text-white mt-1">{dashboardStats.totalSpent.toLocaleString()} <span className="text-sm font-bold text-gray-400">Ks</span></p></div></div>
                  </>
                )}
              </div>
            </div>

            {/* Trip History Chart using processedTrips */}
            {!isDataLoading && dashboardStats.processedTrips.filter(t => t.parsedMonth === (selectedMonth || new Date().toISOString().substring(0, 7))).length > 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-black text-xl dark:text-white mb-8 flex items-center gap-2"><TrendingUp size={22} className="text-indigo-500" /> ခရီးစဉ် အကွာအဝေးနှင့် စွမ်းဆောင်ရည်</h3>
                <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dashboardStats.processedTrips.filter(t => t.parsedMonth === (selectedMonth || new Date().toISOString().substring(0, 7)))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                      <XAxis dataKey="Date" fontSize={11} tickFormatter={(val) => String(val).substring(0, 5)} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" fontSize={11} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" fontSize={11} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: '#111827', color: '#fff', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar yAxisId="left" name="Actual Distance (km)" dataKey="actual_dist" fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Line yAxisId="right" name="Efficiency (km/kWh)" type="monotone" dataKey="Efficiency" stroke="#10B981" strokeWidth={4} dot={{ r: 5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 md:p-8 rounded-3xl border border-blue-100 dark:border-blue-900/50 flex flex-col justify-between shadow-sm">
                <div>
                  <h3 className="font-black text-lg text-blue-900 dark:text-blue-300 mb-6 flex items-center gap-2"><Route size={20} /> Since Last Charge Data</h3>
                  <div className="grid grid-cols-2 gap-5 mb-8">
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Odometer (km)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-blue-500" value={tripInput.distance} onChange={e => setTripInput({ ...tripInput, distance: e.target.value })} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Avg (kWh/100km)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-blue-500" value={tripInput.avgKwh} onChange={e => setTripInput({ ...tripInput, avgKwh: e.target.value })} /></div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">ကြာချိန် (Hr & Min)</label>
                      <div className="flex gap-3">
                        <input type="number" placeholder="Hr" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-blue-500" value={tripInput.durationHr} onChange={e => setTripInput({ ...tripInput, durationHr: e.target.value })} />
                        <input type="number" placeholder="Min" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-blue-500" value={tripInput.durationMin} onChange={e => setTripInput({ ...tripInput, durationMin: e.target.value })} />
                      </div>
                    </div>
                    <div className="col-span-2"><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Battery ကျန်ရှိ (%)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-black text-blue-600 outline-none focus:border-blue-500" value={tripInput.remainingPercent} onChange={e => setTripInput({ ...tripInput, remainingPercent: e.target.value })} /></div>
                  </div>
                </div>
                <button onClick={handleSaveTripLog} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-lg hover:bg-blue-700 transition">Trip မှတ်တမ်းတင်မည်</button>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-6 md:p-8 rounded-3xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col justify-between shadow-sm">
                <div>
                  <h3 className="font-black text-lg text-indigo-900 dark:text-indigo-300 mb-6 flex items-center gap-2"><RefreshCw size={20} /> Car Dashboard Sync</h3>
                  <div className="grid grid-cols-1 gap-5 mb-8">
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">လက်ရှိ Battery (%)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-black text-indigo-600 outline-none focus:border-indigo-500" value={statusInput.battery} onChange={e => setStatusInput({ ...statusInput, battery: e.target.value })} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Dashboard Range (km)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold text-green-600 outline-none focus:border-indigo-500" value={statusInput.range} onChange={e => setStatusInput({ ...statusInput, range: e.target.value })} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Battery SOH (%)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-indigo-500" value={statusInput.soh} onChange={e => setStatusInput({ ...statusInput, soh: e.target.value })} /></div>
                  </div>
                </div>
                <button onClick={handleSaveVehicleStatus} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg hover:bg-indigo-700 transition">ကား ဒေတာ Sync လုပ်မည်</button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mt-8">
              <div className="p-6 md:p-8 border-b dark:border-gray-700"><h3 className="font-black text-xl flex items-center gap-3"><List size={24} className="text-blue-500" /> Trip History Table</h3></div>
              <div className="overflow-x-auto p-4 md:p-6">
                <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead className="text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                    <tr><th className="p-4 rounded-l-2xl font-bold uppercase tracking-wider text-xs">Date</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Actual Dist.</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Avg kWh</th><th className="p-4 rounded-r-2xl font-bold uppercase tracking-wider text-xs">Bat %</th></tr>
                  </thead>
                  <tbody>
                    {dashboardStats.processedTrips.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-gray-400 font-bold">No Trip Records</td></tr> : dashboardStats.processedTrips.slice().reverse().slice(0, 5).map((log, idx) => (
                      <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 shadow-sm transition-all rounded-2xl group">
                        <td className="p-4 rounded-l-2xl font-medium text-gray-600 dark:text-gray-300">{log.Date || log.Time}</td><td className="p-4 font-black text-lg text-blue-600">{log.actual_dist} <span className="text-sm font-medium text-gray-400">km</span></td><td className="p-4 font-bold text-orange-500">{log.Avg_Consumption || log.AvgConsumption || 0}</td><td className="p-4 rounded-r-2xl font-black text-green-500 bg-green-50/50 dark:bg-green-900/10 group-hover:bg-green-50">{log.Remaining_Percent || log['Remaining Percent'] || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-black text-xl dark:text-white px-2 mb-6 flex items-center gap-3"><History size={24} className="text-blue-500" /> အားသွင်းမှု မှတ်တမ်းများ (Charging History)</h3>
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden p-6 md:p-8">
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input type="text" placeholder="ရက်စွဲ သို့မဟုတ် Station ဖြင့် ရှာရန်..." className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-900 outline-none focus:border-blue-500 font-medium transition" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
                  </div>
                  <button onClick={() => setHistorySortDesc(!historySortDesc)} className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-100 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 font-bold transition">
                    <ArrowUpDown size={18} /> {historySortDesc ? 'အများဆုံး (kWh)' : 'အနည်းဆုံး (kWh)'}
                  </button>
                </div>

                {isDataLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-separate border-spacing-y-3">
                      <thead className="text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                        <tr><th className="p-4 rounded-l-2xl font-bold uppercase tracking-wider text-xs">Date / Time</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Station</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Battery %</th><th className="p-4 rounded-r-2xl font-bold uppercase tracking-wider text-xs text-right">kWh</th></tr>
                      </thead>
                      <tbody>
                        {sortedHistoryLogs.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-gray-400 font-bold bg-gray-50 dark:bg-gray-800 rounded-2xl">မှတ်တမ်းမရှိသေးပါ</td></tr>
                        ) : (
                          sortedHistoryLogs.map((log, idx) => (
                            <tr key={idx} onClick={() => { if (log.Timeline_Data && log.Timeline_Data !== '[]') setSelectedHistoryLog(log); else alert('Timeline အသေးစိတ် မရှိပါ။'); }} className="bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700/50 shadow-sm border border-gray-100 dark:border-gray-700 rounded-2xl cursor-pointer transition-all transform hover:scale-[1.01]">
                              <td className="p-4 rounded-l-2xl whitespace-nowrap font-medium text-gray-600 dark:text-gray-300">
                                <Clock size={14} className="inline mr-2 text-gray-400" />
                                {/* log['Date & Time'] ကို ထည့်ပေးရပါမယ် */}
                                {log['Date & Time'] || log.Date || log.Time || '-'}
                              </td>
                              <td className="p-4 font-bold text-gray-800 dark:text-white">{log.Station_Name || log.Station || '-'}</td>
                              <td className="p-4 font-bold text-gray-500">{log.Start_Percent || log['Start%'] || '-'}% <span className="text-gray-300 mx-1">➔</span> {log.End_Percent || log['End%'] || '-'}%</td>
                              <td className="p-4 rounded-r-2xl text-right font-black text-lg text-blue-600 bg-blue-50/50 dark:bg-blue-900/10">+{log.Consumed_kWh || log.ConsumedkWh || log['Consumed kWh'] || log.kwh || 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Modal */}
            {selectedHistoryLog && (
              <div className="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm flex justify-center items-end md:items-center p-0 md:p-4">
                <div className="bg-white dark:bg-gray-800 w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-slide-up">
                  <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-black text-xl dark:text-white flex items-center gap-3"><Activity size={24} className="text-blue-500" /> အားသွင်းမှု အသေးစိတ် (Timeline)</h3>
                    <button onClick={() => setSelectedHistoryLog(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition"><X size={24} /></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 space-y-8">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4 rounded-2xl"><span className="text-gray-400 font-bold uppercase tracking-wider text-xs block mb-1">Station</span><strong className="dark:text-white text-base">{selectedHistoryLog.Station_Name || selectedHistoryLog.Station}</strong></div>
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4 rounded-2xl"><span className="text-gray-400 font-bold uppercase tracking-wider text-xs block mb-1">Date & Time</span><strong className="dark:text-white text-base">{selectedHistoryLog.Date || selectedHistoryLog.Time}</strong></div>
                    </div>
                    {selectedHistoryLog.Timeline_Data && selectedHistoryLog.Timeline_Data !== '[]' && selectedHistoryLog.Timeline_Data !== 'undefined' && (
                      <>
                        <div style={{ width: '100%', height: '280px', minHeight: '280px' }} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-3xl border border-gray-100 dark:border-gray-800">
                          <ResponsiveContainer>
                            <LineChart data={JSON.parse(selectedHistoryLog.Timeline_Data)}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                              <XAxis dataKey="time" fontSize={11} axisLine={false} tickLine={false} />
                              <YAxis yAxisId="left" domain={[0, 100]} stroke="#10B981" fontSize={11} axisLine={false} tickLine={false} />
                              <YAxis yAxisId="right" orientation="right" stroke="#3B82F6" fontSize={11} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: '16px', backgroundColor: '#111827', color: '#fff', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} />
                              <Line yAxisId="left" name="Battery %" type="monotone" dataKey="percent" stroke="#10B981" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                              <Line yAxisId="right" name="Consumed kWh" type="monotone" dataKey="kwh" stroke="#3B82F6" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                          <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 rounded-xl">
                            <tr><th className="p-3 rounded-l-xl font-bold uppercase text-xs tracking-wider">Time</th><th className="p-3 font-bold uppercase text-xs tracking-wider text-center">Battery %</th><th className="p-3 rounded-r-xl font-bold uppercase text-xs tracking-wider text-right">Consumed kWh</th></tr>
                          </thead>
                          <tbody>
                            {JSON.parse(selectedHistoryLog.Timeline_Data).map((t: any, i: number) => (
                              <tr key={i} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-xl">
                                <td className="p-4 rounded-l-xl font-medium">{t.time}</td>
                                <td className="p-4 text-center font-black text-lg text-green-600 bg-green-50/50 dark:bg-green-900/10">{t.percent}%</td>
                                <td className="p-4 rounded-r-xl text-right font-black text-lg text-blue-600 bg-blue-50/50 dark:bg-blue-900/10">{t.kwh}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: PROFILE */}
        {activeTab === 'profile' && (
          <section className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative pb-8 overflow-hidden">
              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1582236353526-9d5f7fa54d8b?q=80&w=1000&auto=format&fit=crop')` }}></div>
              <div className="px-8 flex flex-col items-center -mt-20 relative z-10">
                <div className="w-40 h-40 bg-white dark:bg-gray-800 p-2 rounded-full shadow-2xl border-4 border-white dark:border-gray-700 mb-6 relative">
                  <img src={userProfile.carImage} alt="Car" className="w-full h-full object-cover rounded-full" />
                  <div className="absolute bottom-2 right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-white dark:border-gray-800"></div>
                </div>
                <h2 className="text-3xl font-black dark:text-white text-center mb-1">{userProfile.name}</h2>
                <h3 className="text-xl font-bold text-gray-500 dark:text-gray-400 text-center mb-4">Leapmotor B10</h3>
                <p><span className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-black tracking-[0.2em] shadow-inner">{userProfile.carPlate}</span></p>
              </div>
              <div className="mt-10 px-8 grid grid-cols-2 gap-6 text-center">
                <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800"><p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">User Account</p><p className="font-black text-lg">{currentUser?.Phone || currentUser?.phone}</p></div>
                <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-900/50"><p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">Total Distance</p><p className="font-black text-xl text-blue-600 dark:text-blue-400">{userProfile.totalDistance.toLocaleString()} <span className="text-sm font-bold">km</span></p></div>
              </div>
              <div className="px-8 mt-8">
                <button onClick={logout} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-100 dark:hover:bg-red-900/40 transition"><LogOut size={20} /> Logout Account</button>
              </div>
            </div>
          </section>
        )}

      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 flex justify-around items-center p-2 z-50 safe-area-bottom shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('planner')} className={`flex flex-col items-center gap-1.5 w-full py-2 transition-transform active:scale-95 ${activeTab === 'planner' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`p-1.5 rounded-full ${activeTab === 'planner' ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}><MapPin size={24} className={activeTab === 'planner' ? 'fill-blue-100 dark:fill-blue-900/50' : ''} /></div><span className="text-[10px] font-black uppercase tracking-wider">Planner</span>
        </button>
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1.5 w-full py-2 transition-transform active:scale-95 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`p-1.5 rounded-full ${activeTab === 'dashboard' ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}><LayoutDashboard size={24} className={activeTab === 'dashboard' ? 'fill-blue-100 dark:fill-blue-900/50' : ''} /></div><span className="text-[10px] font-black uppercase tracking-wider">Dash</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1.5 w-full py-2 transition-transform active:scale-95 ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`p-1.5 rounded-full ${activeTab === 'profile' ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}><UserIcon size={24} className={activeTab === 'profile' ? 'fill-blue-100 dark:fill-blue-900/50' : ''} /></div><span className="text-[10px] font-black uppercase tracking-wider">Profile</span>
        </button>
      </div>

    </main>
  );
}
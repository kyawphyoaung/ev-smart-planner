'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { getNextEPCStatusChange, EPCStatus } from '../lib/epcSchedule';
import { fetchSheetData, appendSheetData } from '../services/api';
import { calculateCharging } from '../lib/chargingCalc';
import { Zap, ZapOff, BatteryCharging, MapPin, Car, Moon, Sun, CheckCircle, Activity, LayoutDashboard, Heart, Route, CreditCard, Calendar, History, Clock, TrendingUp, AlertTriangle, Search, ArrowUpDown, X, ShieldCheck, Info, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import dynamic from 'next/dynamic';
import { vehicleData } from '../data/vehicles';
import { stationData } from '../data/stations';
import { formatDuration } from '../lib/utils';
import { LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const StationMap = dynamic(() => import('../components/StationMap'), { ssr: false, loading: () => <div className="h-[400px] w-full bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">Map Loading...</div> });

const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}></div>;

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'planner' | 'dashboard'>('planner');

  const [isDataLoading, setIsDataLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const [epcStatus, setEpcStatus] = useState<EPCStatus>('POWER_ON');
  const [nextTimeStr, setNextTimeStr] = useState<string>('');
  const [calcResult, setCalcResult] = useState<any>(null);

  const selectedStation = useAppStore((state) => state.selectedStation);
  const calcParams = useAppStore((state) => state.calcParams);
  const updateCalcParams = useAppStore((state) => state.updateCalcParams);
  const userProfile = useAppStore((state) => state.userProfile);
  const favoriteStations = useAppStore((state) => state.favoriteStations);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);

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

  const [tripInput, setTripInput] = useState({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '' });
  const [statusInput, setStatusInput] = useState({ battery: '', range: '', soh: '' }); // 👈 SOH & Range Sync Input

  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [tripLogs, setTripLogs] = useState<any[]>([]);
  const [vehicleStatusLogs, setVehicleStatusLogs] = useState<any[]>([]); // 👈 New SOH & Range Logs

  const [historySearch, setHistorySearch] = useState('');
  const [historySortDesc, setHistorySortDesc] = useState(true);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<any | null>(null);

  // === 1. Safe Fetch & Error Handling ===
  useEffect(() => {
    setMounted(true);
    const fetchInitialData = async () => {
      try {
        const queueData = await fetchSheetData('Queue_Logs');
        if (queueData && queueData.length > 0) {
          const totalAvg = queueData.reduce((sum: number, row: any) => sum + Number(row.Avg_Per_Car_Mins || 0), 0);
          if (Math.round(totalAvg / queueData.length) > 0) useAppStore.getState().setGlobalAvgWaitMins(Math.round(totalAvg / queueData.length));
        }
        const cLogs = await fetchSheetData('Charging_Logs');
        if (cLogs) setDashboardLogs(cLogs);
        const tLogs = await fetchSheetData('Trip_Logs');
        if (tLogs && tLogs.length > 0) {
          setTripLogs(tLogs);
          const latestMonth = tLogs[tLogs.length - 1]?.Month;
          if (latestMonth) setSelectedMonth(latestMonth);
        } else {
          const d = new Date(); setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const vLogs = await fetchSheetData('Vehicle_Status'); // 👈 Fetch SOH & Sync Logs
        if (vLogs) setVehicleStatusLogs(vLogs);
      } catch (error) {
        setInitialLoadError("အင်တာနက်ချိတ်ဆက်မှု ပြဿနာကြောင့် ဒေတာအချို့ ဆွဲယူ၍မရပါ။");
      } finally {
        setIsDataLoading(false); 
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    setNextTimeStr(getNextEPCStatusChange(new Date(), epcStatus).toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }));
  }, [epcStatus]);

  useEffect(() => {
    if (calcResult || isCharging) {
      const baseTime = (trackingQueue && queueStartTime) ? queueStartTime : new Date();
      setCalcResult(calculateCharging({ ...calcParams, hasBackupPower: selectedStation?.has_backup_power || false }, baseTime, epcStatus));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcParams, trackingQueue, queueStartTime, epcStatus, selectedStation]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCharging, calcParams.currentPercent, calcParams.targetPercent, calcParams.chargerKw, calcParams.batteryCapacityKwh, calcParams.isLeapmotorB10, consumedKwh]);

  // --- Handlers ---
  const handleCalculate = () => setCalcResult(calculateCharging({ ...calcParams, hasBackupPower: selectedStation?.has_backup_power || false }, (trackingQueue && queueStartTime) ? queueStartTime : new Date(), epcStatus));
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
      try { await appendSheetData('Queue_Logs', [`Q-${Date.now()}`, now.toLocaleString(), selectedStation.name_text, initialQueueCount, safeTotalMins, Math.round(safeTotalMins / initialQueueCount)]); } catch (e) {}
      alert(`သင့်အလှည့်ရောက်ပါပြီ!`);
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
      station: selectedStation?.name_text, vehicle: vehicleData.find(v => v.id === calcParams.vehicleId)?.brand + " " + vehicleData.find(v => v.id === calcParams.vehicleId)?.model,
      startPercent: initialStartPercent, endPercent: finalPercent, kwh: Number(finalKwh.toFixed(2)), lossKwh: Number(energyLossKwh.toFixed(2)),
      actualMins: chargingStartTime ? Math.round((new Date().getTime() - chargingStartTime.getTime()) / 60000) : 0, predictedDuration: calcResult?.chargeDurationStr || '-',
      cost: Math.round(finalKwh * calcParams.pricePerKwh), date: new Date().toLocaleString(), timelineJson: JSON.stringify(chargingLogs.filter(log => log.isManual))
    };
    setFinalReceiptData(finalData);
    try {
      await appendSheetData('Charging_Logs', [`C-${Date.now()}`, finalData.date, finalData.station, finalData.vehicle, finalData.startPercent, finalData.endPercent, finalData.kwh, finalData.lossKwh, finalData.actualMins, finalData.predictedDuration, finalData.cost, finalData.timelineJson, 'Completed']);
      setDashboardLogs(prev => [...prev, { Date: finalData.date, Station_Name: finalData.station, Consumed_kWh: finalData.kwh, Cost: finalData.cost, Start_Percent: finalData.startPercent, End_Percent: finalData.endPercent, Timeline_Data: finalData.timelineJson }]);
    } catch (e) {}
  };

  const handleSaveTripLog = async () => {
    if (!tripInput.distance || !tripInput.avgKwh || !tripInput.remainingPercent) return alert("အချက်အလက်များ ပြည့်စုံစွာ ထည့်ပါ။");
    const usedKwh = (Number(tripInput.distance) / 100) * Number(tripInput.avgKwh);
    const tripDataObj = {
      ID: `T-${Date.now()}`, Date: new Date().toLocaleDateString(), Month: selectedMonth, Distance_km: Number(tripInput.distance),
      Duration: `${Number(tripInput.durationHr) || 0}hr ${Number(tripInput.durationMin) || 0}mins`, Avg_Consumption: Number(tripInput.avgKwh), Used_kWh: Number(usedKwh.toFixed(2)),
      Efficiency: Number((100 / Number(tripInput.avgKwh)).toFixed(2)), Remaining_Percent: Number(tripInput.remainingPercent)
    };
    try {
      await appendSheetData('Trip_Logs', Object.values(tripDataObj)); setTripLogs(prev => [...prev, tripDataObj]); alert(`မှတ်တမ်းတင်ပြီးပါပြီ!`); setTripInput({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  // 👈 Handle Vehicle Manual Status Sync (SOH & Range)
  const handleSaveVehicleStatus = async () => {
    if (!statusInput.battery || !statusInput.range || !statusInput.soh) return alert("အချက်အလက်များ အပြည့်အစုံထည့်ပါ။");
    const statusData = { ID: `V-${Date.now()}`, Date: new Date().toLocaleString(), Battery_Percent: Number(statusInput.battery), Dash_Range_km: Number(statusInput.range), SOH_Percent: Number(statusInput.soh) };
    try {
      await appendSheetData('Vehicle_Status', Object.values(statusData)); setVehicleStatusLogs(prev => [...prev, statusData]); alert(`ကား ဒေတာ အပ်ဒိတ်လုပ်ပြီးပါပြီ!`); setStatusInput({ battery: '', range: '', soh: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  // === Dynamic Dashboard Analytics & Robust Column Parsing ===
  const dashboardStats = useMemo(() => {
    const safeDateParse = (dStr: any) => {
      const d = new Date(dStr); if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mMatch = String(dStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mMatch) { let m = Number(mMatch[1]); let y = mMatch[3]; if (m > 12) m = Number(mMatch[2]); return `${y}-${String(m).padStart(2, '0')}`; }
      return null;
    };

    const monthTrips = tripLogs.filter(t => t.Month === selectedMonth);
    const monthCharges = dashboardLogs.filter(c => safeDateParse(c.Date || c.Time) === selectedMonth);

    const totalDist = monthTrips.reduce((sum, t) => sum + Number(t.Distance_km || t.Distance || t['Distance (km)'] || 0), 0);
    const totalUsedKwh = monthTrips.reduce((sum, t) => sum + Number(t.Used_kWh || t.UsedkWh || t['Used kWh'] || 0), 0);
    const avgConsumption = monthTrips.length > 0 ? (monthTrips.reduce((sum, t) => sum + Number(t.Avg_Consumption || t.AvgConsumption || 0), 0) / monthTrips.length) : 11; 
    const totalRecharged = monthCharges.reduce((sum, c) => sum + Number(c.Consumed_kWh || c.ConsumedkWh || c['Consumed kWh'] || c.kwh || 0), 0);
    const totalSpent = monthCharges.reduce((sum, c) => sum + Number(c.Cost || c.Total_Cost || c['Total Cost'] || 0), 0);

    // 👈 Latest Data Calculation (Trip vs Charge vs Status Sync)
    const getT = (log: any) => log && log.Date ? new Date(log.Date).getTime() : 0;
    const lTrip = tripLogs[tripLogs.length - 1]; const tTime = getT(lTrip);
    const lCharge = dashboardLogs[dashboardLogs.length - 1]; const cTime = getT(lCharge);
    const lStatus = vehicleStatusLogs[vehicleStatusLogs.length - 1]; const sTime = getT(lStatus);
    const maxTime = Math.max(tTime, cTime, sTime);

    let currentBattery = calcParams.currentPercent;
    let currentRange = 0; let isRangeEstimated = true; let currentSOH = 100;

    if (maxTime > 0) {
      if (sTime === maxTime && lStatus) {
         currentBattery = Number(lStatus.Battery_Percent || lStatus.Battery || currentBattery);
         currentRange = Number(lStatus.Dash_Range_km || lStatus.Range || 0);
         currentSOH = Number(lStatus.SOH_Percent || lStatus.SOH || 100);
         isRangeEstimated = false; // User manually synced range!
      } else if (tTime === maxTime && lTrip) {
         currentBattery = Number(lTrip.Remaining_Percent || lTrip['Remaining Percent'] || currentBattery);
         currentSOH = lStatus ? Number(lStatus.SOH_Percent || lStatus.SOH || 100) : 100;
         isRangeEstimated = true;
      } else if (cTime === maxTime && lCharge) {
         currentBattery = Number(lCharge.End_Percent || lCharge['End%'] || currentBattery);
         currentSOH = lStatus ? Number(lStatus.SOH_Percent || lStatus.SOH || 100) : 100;
         isRangeEstimated = true;
      }
    }

    if (isRangeEstimated) {
      const usablePercent = Math.max(0, currentBattery - 20); // 20% limit logic
      const usableKwh = (usablePercent / 100) * calcParams.batteryCapacityKwh * (currentSOH / 100);
      currentRange = usableKwh * (100 / avgConsumption);
    }

    const dailyAvgKm = monthTrips.length > 1 ? (totalDist / monthTrips.length) : 30;
    const daysUntilCharge = dailyAvgKm > 0 ? (currentRange / dailyAvgKm) : 0;
    const nextChargeDate = new Date(Date.now() + daysUntilCharge * 24 * 60 * 60 * 1000);

    let batColor = "from-green-500 to-green-700 border-green-500";
    if (currentBattery < 30) batColor = "from-red-500 to-red-700 border-red-500";
    else if (currentBattery < 40) batColor = "from-yellow-400 to-yellow-600 border-yellow-400";
    else if (currentBattery < 60) batColor = "from-orange-400 to-orange-600 border-orange-400";

    return { totalDist, totalUsedKwh, totalRecharged, totalSpent, currentBattery, currentRange, isRangeEstimated, currentSOH, nextChargeDate, batColor };
  }, [tripLogs, dashboardLogs, vehicleStatusLogs, selectedMonth, calcParams.batteryCapacityKwh, calcParams.currentPercent]);

  // --- Filtering & Sorting for Table ---
  const sortedHistoryLogs = useMemo(() => {
    return dashboardLogs
      .filter(log => String(log.Date || log.Time || '').toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => {
        const valA = Number(a.Consumed_kWh || a.ConsumedkWh || a['Consumed kWh'] || a.kwh || 0);
        const valB = Number(b.Consumed_kWh || b.ConsumedkWh || b['Consumed kWh'] || b.kwh || 0);
        return historySortDesc ? valB - valA : valA - valB;
      });
  }, [dashboardLogs, historySearch, historySortDesc]);


  return (
    <main className="min-h-screen pb-12 bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-200 relative">
      <nav className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">EV Smart Planner</h1>
          {mounted && <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 transition">{theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}</button>}
        </div>
        {!isCharging && !showReceipt && (
          <div className="max-w-3xl mx-auto px-4 md:px-8 flex gap-4 border-b dark:border-gray-700">
            <button onClick={() => setActiveTab('planner')} className={`pb-3 font-semibold text-sm transition-colors relative ${activeTab === 'planner' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><BatteryCharging size={18}/> Charging Planner</div>{activeTab === 'planner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>}</button>
            <button onClick={() => setActiveTab('dashboard')} className={`pb-3 font-semibold text-sm transition-colors relative ${activeTab === 'dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><LayoutDashboard size={18}/> My Dashboard</div>{activeTab === 'dashboard' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>}</button>
          </div>
        )}
      </nav>

      {initialLoadError && <div className="max-w-3xl mx-auto mt-4 px-4"><div className="bg-red-50 text-red-600 p-3 rounded-lg border border-red-200 text-sm flex gap-2"><AlertTriangle size={18}/> {initialLoadError}</div></div>}

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8">

        {/* ==========================================
            TAB 1: PLANNER 
        ========================================== */}
        {activeTab === 'planner' && (
          <>
            {!isCharging && !showReceipt && (
            <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white"><MapPin className="text-red-500" /> EV Stations Map</h2>
              <StationMap />
            </section>
            )}

            {isCharging && (
              <section className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse"></div>
                <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400"><BatteryCharging size={28} className="animate-bounce" /> အားသွင်းနေပါသည်...</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6">{selectedStation?.name_text}</p>
                <div className="flex justify-center items-center mb-8">
                  <div className="relative w-48 h-48 rounded-full border-8 border-gray-100 dark:border-gray-700 flex items-center justify-center shadow-inner">
                    <div className="absolute top-0 left-0 w-full h-full rounded-full border-8 border-green-500 transition-all duration-1000" style={{ clipPath: `polygon(50% 50%, 50% 0%, ${calcParams.currentPercent > 25 ? '100% 0%,' : ''} ${calcParams.currentPercent > 50 ? '100% 100%,' : ''} ${calcParams.currentPercent > 75 ? '0% 100%,' : ''} 0% 0%)` }}></div>
                    <div className="text-5xl font-black text-green-600 z-10">{calcParams.currentPercent}%</div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mb-6 flex justify-between items-center text-left border border-gray-200 dark:border-gray-700">
                  <div><p className="text-sm text-gray-500">ကျန်ရှိချိန်</p><p className="font-bold text-lg">{calcResult?.chargeDurationStr}</p></div>
                  <div className="text-right"><p className="text-sm text-gray-500">ပြီးဆုံးမည့် အချိန်</p><p className="font-bold text-lg text-blue-600">{calcResult?.finishTimeStr}</p></div>
                </div>
                {energyLossKwh > 0 && <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded text-sm text-left">⚠️ ကားနှင့် Charger ကြား စွမ်းအင်အလေအလွင့် (Efficiency Loss): <strong>{energyLossKwh.toFixed(2)} kWh</strong> ရှိနေပါသည်။</div>}
                <button onClick={() => handleCompleteCharging(calcParams.currentPercent, consumedKwh)} className="w-full bg-red-500 text-white py-4 rounded-lg font-bold shadow-md hover:bg-red-600">အားသွင်းခြင်း ရပ်မည် (Stop)</button>
              </section>
            )}

            {showReceipt && finalReceiptData && (
              <section className="bg-white dark:bg-gray-800 p-6 md:p-10 rounded-2xl shadow-lg border border-green-200 dark:border-green-800 text-center">
                <CheckCircle size={60} className="text-green-500 mx-auto mb-4" />
                <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-8">အားသွင်းခြင်း ပြီးဆုံးပါပြီ</h2>
                <button onClick={() => { setShowReceipt(false); setChargingLogs([]); }} className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold shadow-md hover:bg-blue-700">ပင်မစာမျက်နှာသို့ ပြန်သွားမည်</button>
              </section>
            )}

            {/* --- Calculator Form --- */}
            {!isCharging && !showReceipt && (
            <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><BatteryCharging className="text-green-500" /> Charging Calculator</h2>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Station အား စာရင်းမှ ရွေးချယ်ရန်</label>
                <select className="w-full border dark:border-gray-600 bg-transparent p-3 rounded-lg dark:bg-gray-800" value={selectedStation?.id || ""} onChange={(e) => {
                    const st = stationData.hits.hits.find(hit => hit._source.id === e.target.value)?._source;
                    if (st) useAppStore.getState().setSelectedStation(st);
                  }}>
                  <option value="">-- မြေပုံ (သို့) စာရင်းမှ Station တစ်ခု ရွေးချယ်ပါ --</option>
                  {stationData.hits.hits.map(hit => <option key={hit._source.id} value={hit._source.id}>{hit._source.name_text}</option>)}
                </select>
              </div>

              <div className="mb-6 p-5 rounded-xl border border-blue-100 dark:border-gray-700 bg-blue-50/30 dark:bg-gray-800/50">
                <label className="block text-sm font-bold mb-3 dark:text-gray-200">လက်ရှိ လျှပ်စစ်မီး အခြေအနေ</label>
                <div className="flex gap-4">
                  <button onClick={() => setEpcStatus('POWER_ON')} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-sm ${epcStatus === 'POWER_ON' ? 'bg-green-500 text-white ring-2 ring-green-300' : 'bg-white text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}><Zap size={20} /> မီးလာနေသည်</button>
                  <button onClick={() => setEpcStatus('POWER_OFF')} className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-sm ${epcStatus === 'POWER_OFF' ? 'bg-red-500 text-white ring-2 ring-red-300' : 'bg-white text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}><ZapOff size={20} /> မီးပျက်နေသည်</button>
                </div>
              </div>

              {/* 👈 ပြန်လည်ထည့်သွင်းထားသော Battery Capacity နှင့် Charger Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">ကားအမျိုးအစား (Vehicle Model)</label>
                  <select className="w-full border dark:border-gray-600 bg-transparent p-3 rounded-lg dark:bg-gray-800" value={calcParams.vehicleId || ""} onChange={(e) => {
                      const car = vehicleData.find(v => v.id === e.target.value);
                      if (car) updateCalcParams({ vehicleId: e.target.value, batteryCapacityKwh: car.batteryKwh, isLeapmotorB10: car.isLeapmotor });
                    }}>
                    {vehicleData.map(car => <option key={car.id} value={car.id}>{car.brand} {car.model} ({car.batteryKwh} kWh)</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Battery Capacity (kWh)</label>
                  <input type="number" className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.batteryCapacityKwh} onChange={e => updateCalcParams({ batteryCapacityKwh: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Charger Speed (kW)</label>
                  <select className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.chargerKw} onChange={e => updateCalcParams({ chargerKw: Number(e.target.value) })}>
                    <option value={30}>30 kW</option><option value={40}>40 kW</option><option value={50}>50 kW</option><option value={60}>60 kW</option><option value={120}>120 kW</option>
                  </select>
                </div>

                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">တစ်ပြိုင်နက်သွင်းနိုင်သော အစီးအရေ</label><input type="number" min="1" className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.activePorts} onChange={e => updateCalcParams({ activePorts: Math.max(1, Number(e.target.value)) })} /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">ရှေ့တွင်စောင့်နေသော ကား (စီး)</label><input type="number" min="0" className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.carsInQueue} onChange={e => updateCalcParams({ carsInQueue: Number(e.target.value) })} /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">Current %</label><input type="number" className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.currentPercent} onChange={e => updateCalcParams({ currentPercent: Number(e.target.value) })} /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">Target %</label><input type="number" className="w-full border p-3 rounded-lg dark:border-gray-600 dark:bg-gray-800" value={calcParams.targetPercent} onChange={e => updateCalcParams({ targetPercent: Number(e.target.value) })} /></div>
              </div>

              <button onClick={handleCalculate} className="w-full bg-gray-800 dark:bg-gray-700 text-white px-4 py-4 rounded-xl hover:bg-gray-900 transition font-bold shadow-md">ခန့်မှန်းချက် တွက်မည်</button>

              {calcParams.carsInQueue > 0 && !trackingQueue ? (
                <button onClick={startQueueTracking} className="w-full mt-4 bg-orange-500 text-white px-4 py-4 rounded-xl hover:bg-orange-600 font-bold shadow-md">စတင်စောင့်ဆိုင်းမည်</button>
              ) : calcParams.carsInQueue === 0 && !trackingQueue ? (
                <button onClick={startCharging} className="w-full mt-4 bg-blue-600 text-white px-4 py-4 rounded-xl hover:bg-blue-700 font-bold shadow-md flex justify-center items-center gap-2"><BatteryCharging size={20}/> အားစသွင်းမည်</button>
              ) : null}

              {calcResult && (
                <div className="mt-8 p-5 bg-gray-50 dark:bg-gray-800/80 border dark:border-gray-700 rounded-2xl">
                  <h3 className="font-bold text-lg mb-4 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">ခန့်မှန်းခြေ အချိန်စာရင်း (Estimation Details)</h3>
                  <div className="space-y-4 text-sm dark:text-gray-200">
                    <div className="flex justify-between"><span>ကားစောင့်ရမည့် ကြာချိန်</span><span className="font-semibold text-orange-500 text-base">{calcResult.waitDurationStr}</span></div>
                    <div className="flex justify-between"><span>အားစသွင်းရမည့် အချိန် (Start Time)</span><span className="font-semibold text-base">{calcResult.startTimeStr}</span></div>
                    <div className="flex justify-between"><span>အားသွင်းကြာချိန်</span><span className="font-semibold text-blue-500 text-base">{calcResult.chargeDurationStr}</span></div>
                    <div className="flex justify-between text-lg font-black pt-3 border-t border-gray-200 dark:border-gray-700"><span>ပြီးဆုံးမည့် အချိန် (Finish)</span><span className="text-green-600 dark:text-green-400">{calcResult.finishTimeStr}</span></div>
                  </div>
                </div>
              )}
            </section>
            )}
          </>
        )}

        {/* ==========================================
            TAB 2: USER DASHBOARD 
        ========================================== */}
        {activeTab === 'dashboard' && (
          <section className="space-y-8">
            
            {/* --- Car Profile Card --- */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative pb-6 mt-6">
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-t-2xl"></div>
              <div className="px-6 flex flex-col md:flex-row gap-4 md:items-end -mt-12 relative z-10">
                <div className="w-24 h-24 md:w-28 md:h-28 bg-white dark:bg-gray-800 p-1 rounded-2xl shadow-lg border-4 border-white dark:border-gray-700 shrink-0">
                  <img src={userProfile.carImage} alt="Car" className="w-full h-full object-cover rounded-xl" />
                </div>
                <div className="flex-1 pb-2">
                  <h2 className="text-2xl font-black dark:text-white">{vehicleData.find(v => v.id === calcParams.vehicleId)?.brand} {vehicleData.find(v => v.id === calcParams.vehicleId)?.model}</h2>
                  <p className="mt-2"><span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 text-sm font-bold tracking-widest">{userProfile.carPlate}</span></p>
                </div>
              </div>
            </div>

            {/* --- 👈 Top Prediction Card (Dynamic Range & SOH Advisory) --- */}
            {isDataLoading ? <Skeleton className="h-40 w-full" /> : (
              <div className="space-y-4">
                <div className={`bg-gradient-to-br ${dashboardStats.batColor} rounded-2xl shadow-lg p-6 text-white transition-colors duration-500 border-4 border-transparent`}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-white/80 font-medium mb-1">လက်ရှိ Battery အခြေအနေ</p>
                      <div className="flex items-end gap-2"><span className="text-5xl font-black">{dashboardStats.currentBattery}%</span></div>
                    </div>
                    <div className="text-right">
                      <p className="text-white/80 font-medium mb-1">သွားနိုင်မည့် အကွာအဝေး</p>
                      <div className="flex items-end justify-end gap-2 mb-1">
                        <p className="text-3xl font-bold">{Math.round(dashboardStats.currentRange)} <span className="text-lg font-normal">km</span></p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold shadow-sm ${dashboardStats.isRangeEstimated ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'}`}>
                        {dashboardStats.isRangeEstimated ? 'ခန့်မှန်း (Estimated)' : 'လက်တွေ့ (Car Sync)'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-white/20 flex items-center gap-3">
                    <Calendar className="text-white" size={24} />
                    <div>
                      <p className="text-sm text-white/80">နောက်တစ်ကြိမ် အားပြန်သွင်းရမည့် ခန့်မှန်းရက် (20% Limit)</p>
                      <p className="font-bold text-lg">{dashboardStats.nextChargeDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* SOH Battery Health Advisory */}
                <div className={`border p-4 rounded-xl flex items-start gap-3 shadow-sm ${dashboardStats.currentSOH < 95 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                  <ShieldCheck className={dashboardStats.currentSOH < 95 ? 'text-red-500 mt-1 shrink-0' : 'text-blue-500 mt-1 shrink-0'} size={24} />
                  <div>
                    <h4 className={`font-bold ${dashboardStats.currentSOH < 95 ? 'text-red-800' : 'text-blue-800'}`}>Battery Health Advisory (SOH: {dashboardStats.currentSOH}%)</h4>
                    <p className={`text-sm mt-1 ${dashboardStats.currentSOH < 95 ? 'text-red-700' : 'text-blue-700'}`}>
                      {dashboardStats.currentSOH < 95 
                        ? "SOH အနည်းငယ် ကျဆင်းနေပါသည်။ Fast Charging သုံးစွဲမှုကို လျှော့ချပြီး AC (Slow Charge) ကို ပိုမိုအသုံးပြုရန် အကြံပြုအပ်ပါသည်။" 
                        : "Battery ကျန်းမာရေး အလွန်ကောင်းမွန်ပါသည်။ 20% အောက် မရောက်ခင် အားသွင်းသည့် အလေ့အကျင့်ကို ဆက်ထိန်းပါ။"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* --- Month Selector & Stats --- */}
            <div>
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Calendar size={20}/> အသုံးပြုမှု မှတ်တမ်း</h3>
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-blue-600 dark:text-blue-400 font-bold px-4 py-2 rounded-xl shadow-sm outline-none cursor-pointer"/>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {isDataLoading ? (
                  <><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></>
                ) : (
                  <>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"><Route className="text-blue-500 mb-2" size={24} /><p className="text-xs text-gray-500 font-medium">ခရီးစဉ်အကွာအဝေး</p><p className="text-xl font-black dark:text-white mt-1">{dashboardStats.totalDist} <span className="text-sm font-normal">km</span></p></div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"><ZapOff className="text-orange-500 mb-2" size={24} /><p className="text-xs text-gray-500 font-medium">သုံးစွဲခဲ့သော စွမ်းအင်</p><p className="text-xl font-black dark:text-white mt-1">{dashboardStats.totalUsedKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span></p></div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"><BatteryCharging className="text-green-500 mb-2" size={24} /><p className="text-xs text-gray-500 font-medium">အားပြန်သွင်းမှု</p><p className="text-xl font-black dark:text-white mt-1">{dashboardStats.totalRecharged.toFixed(1)} <span className="text-sm font-normal">kWh</span></p></div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"><CreditCard className="text-red-500 mb-2" size={24} /><p className="text-xs text-gray-500 font-medium">ကုန်ကျစရိတ်</p><p className="text-xl font-black dark:text-white mt-1">{dashboardStats.totalSpent.toLocaleString()} <span className="text-sm font-normal">Ks</span></p></div>
                  </>
                )}
              </div>
            </div>

            {/* --- Trip History Chart (Error Fixed) --- */}
            {!isDataLoading && tripLogs.filter(t => t.Month === selectedMonth).length > 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mt-8">
                <h3 className="font-bold text-lg dark:text-white mb-6 flex items-center gap-2"><TrendingUp size={20} className="text-indigo-500"/> ခရီးစဉ် အကွာအဝေးနှင့် စွမ်းဆောင်ရည်</h3>
                <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={tripLogs.filter(t => t.Month === selectedMonth)}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="Date" fontSize={12} tickFormatter={(val) => String(val).substring(0, 5)} />
                      <YAxis yAxisId="left" fontSize={12} />
                      <YAxis yAxisId="right" orientation="right" fontSize={12} />
                      <Tooltip contentStyle={{ borderRadius: '8px', backgroundColor: '#1F2937', color: '#fff' }} />
                      <Legend />
                      <Bar yAxisId="left" name="Distance (km)" dataKey="Distance_km" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" name="Efficiency (km/kWh)" type="monotone" dataKey="Efficiency" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* --- 👈 Sync Car Data Forms (Grid ညီအောင် ပြင်ဆင်ထားသည်) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              
              {/* Form 1: Trip Sync */}
              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-6 flex items-center gap-2"><Car size={20}/> Since Last Charge Data</h3>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div><label className="block text-xs font-bold mb-2 text-gray-600">ခရီး (km)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={tripInput.distance} onChange={e=>setTripInput({...tripInput, distance: e.target.value})}/></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600">Avg (kWh/100km)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={tripInput.avgKwh} onChange={e=>setTripInput({...tripInput, avgKwh: e.target.value})}/></div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold mb-2 text-gray-600">ကြာချိန် (Hr & Min)</label>
                      <div className="flex gap-2">
                        <input type="number" placeholder="Hr" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={tripInput.durationHr} onChange={e=>setTripInput({...tripInput, durationHr: e.target.value})}/>
                        <input type="number" placeholder="Min" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={tripInput.durationMin} onChange={e=>setTripInput({...tripInput, durationMin: e.target.value})}/>
                      </div>
                    </div>
                    <div className="col-span-2"><label className="block text-xs font-bold mb-2 text-gray-600">Battery ကျန်ရှိ (%)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={tripInput.remainingPercent} onChange={e=>setTripInput({...tripInput, remainingPercent: e.target.value})}/></div>
                  </div>
                </div>
                <button onClick={handleSaveTripLog} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700">Trip မှတ်တမ်းတင်မည်</button>
              </div>

              {/* Form 2: Real Dashboard Sync */}
              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-indigo-800 dark:text-indigo-300 mb-6 flex items-center gap-2"><RefreshCw size={20}/> Car Dashboard Sync</h3>
                  <div className="grid grid-cols-1 gap-4 mb-6">
                    <div><label className="block text-xs font-bold mb-2 text-gray-600">လက်ရှိ Battery (%)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={statusInput.battery} onChange={e=>setStatusInput({...statusInput, battery: e.target.value})}/></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600">Dashboard Range (km)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={statusInput.range} onChange={e=>setStatusInput({...statusInput, range: e.target.value})}/></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600">Battery SOH (%)</label><input type="number" className="w-full border p-3 rounded-xl bg-white dark:bg-gray-800 dark:border-gray-700" value={statusInput.soh} onChange={e=>setStatusInput({...statusInput, soh: e.target.value})}/></div>
                  </div>
                </div>
                <button onClick={handleSaveVehicleStatus} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-indigo-700">ကား ဒေတာ Sync လုပ်မည်</button>
              </div>

            </div>

            {/* --- 👈 Charging History Table (Date, Station, Battery အစုံပါသည်) --- */}
            <div className="mt-8">
              <h3 className="font-bold text-lg dark:text-white px-2 mb-4 flex items-center gap-2"><History size={20}/> အားသွင်းမှု မှတ်တမ်းများ (Charging History)</h3>
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden p-4">
                
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                    <input type="text" placeholder="ရက်စွဲ သို့မဟုတ် Station ဖြင့် ရှာရန်..." className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
                  </div>
                  <button onClick={() => setHistorySortDesc(!historySortDesc)} className="flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-bold">
                    <ArrowUpDown size={16}/> {historySortDesc ? 'အများဆုံး (kWh)' : 'အနည်းဆုံး (kWh)'}
                  </button>
                </div>

                {isDataLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 border-b dark:border-gray-700">
                        <tr><th className="p-3">Date / Time</th><th className="p-3">Station</th><th className="p-3">Battery %</th><th className="p-3 text-right">kWh</th></tr>
                      </thead>
                      <tbody>
                        {sortedHistoryLogs.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-gray-400">မှတ်တမ်းမရှိသေးပါ</td></tr>
                        ) : (
                          sortedHistoryLogs.map((log, idx) => (
                            <tr key={idx} onClick={() => { if(log.Timeline_Data) setSelectedHistoryLog(log); else alert('Timeline အသေးစိတ် မရှိပါ။'); }} className="border-b dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700/50 cursor-pointer transition">
                              <td className="p-3 whitespace-nowrap"><Clock size={12} className="inline mr-1 text-gray-400"/>{log.Date || log.Time || '-'}</td>
                              <td className="p-3 font-medium">{log.Station_Name || log.Station || '-'}</td>
                              <td className="p-3 text-gray-500">{log.Start_Percent || log['Start%'] || '-'}% ➔ {log.End_Percent || log['End%'] || '-'}%</td>
                              <td className="p-3 text-right font-bold text-green-600">+{log.Consumed_kWh || log.ConsumedkWh || log['Consumed kWh'] || log.kwh || 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* --- Timeline Modal (Chart & Table) --- */}
            {selectedHistoryLog && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-bold text-lg dark:text-white flex items-center gap-2"><Activity size={20} className="text-blue-500"/> အားသွင်းမှု အသေးစိတ် (Timeline)</h3>
                    <button onClick={() => setSelectedHistoryLog(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg"><span className="text-gray-500 block mb-1">Station</span><strong className="dark:text-white">{selectedHistoryLog.Station_Name || selectedHistoryLog.Station}</strong></div>
                      <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg"><span className="text-gray-500 block mb-1">Date & Time</span><strong className="dark:text-white">{selectedHistoryLog.Date || selectedHistoryLog.Time}</strong></div>
                    </div>

                    {selectedHistoryLog.Timeline_Data && selectedHistoryLog.Timeline_Data !== '[]' && selectedHistoryLog.Timeline_Data !== 'undefined' ? (
                      <>
                        <div style={{ width: '100%', height: '250px', minHeight: '250px' }}>
                          <ResponsiveContainer>
                            <LineChart data={JSON.parse(selectedHistoryLog.Timeline_Data)}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                              <XAxis dataKey="time" fontSize={12} />
                              <YAxis yAxisId="left" domain={[0, 100]} stroke="#10B981" fontSize={12} />
                              <YAxis yAxisId="right" orientation="right" stroke="#3B82F6" fontSize={12} />
                              <Tooltip contentStyle={{ borderRadius: '8px', backgroundColor: '#1F2937', color: '#fff' }} />
                              <Line yAxisId="left" name="Battery %" type="monotone" dataKey="percent" stroke="#10B981" strokeWidth={3} />
                              <Line yAxisId="right" name="Consumed kWh" type="monotone" dataKey="kwh" stroke="#3B82F6" strokeWidth={3} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="w-full text-sm text-center border dark:border-gray-700 rounded-lg overflow-hidden">
                          <thead className="bg-blue-50 dark:bg-gray-900 text-blue-800 dark:text-blue-300">
                            <tr><th className="p-2">Time</th><th className="p-2">Battery %</th><th className="p-2">Consumed kWh</th></tr>
                          </thead>
                          <tbody>
                            {JSON.parse(selectedHistoryLog.Timeline_Data).map((t: any, i: number) => (
                              <tr key={i} className="border-t dark:border-gray-700"><td className="p-2">{t.time}</td><td className="p-2 font-bold text-green-600">{t.percent}%</td><td className="p-2 font-bold text-blue-500">{t.kwh}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    ) : (
                      <p className="text-center text-gray-400 py-8 border border-dashed rounded-lg">Timeline ဒေတာ မရှိပါ</p>
                    )}
                  </div>
                </div>
              </div>
            )}

          </section>
        )}
      </div>
    </main>
  );
}
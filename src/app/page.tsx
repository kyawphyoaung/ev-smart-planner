'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { getNextEPCStatusChange, EPCStatus } from '../lib/epcSchedule';
import { fetchSheetData, appendSheetData, deleteSheetData } from '../services/api';
import { calculateCharging, getActiveKw } from '../lib/chargingCalc';
import { Zap, ZapOff, BatteryCharging, MapPin, Car, Moon, Sun, CheckCircle, Activity, LayoutDashboard, Heart, Route, CreditCard, Calendar, History, Clock, TrendingUp, AlertTriangle, Search, ArrowUpDown, X, ShieldCheck, RefreshCw, User as UserIcon, LogOut, ChevronDown, List, Loader2, Info } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import dynamic from 'next/dynamic';
import { vehicleData } from '../data/vehicles';
import { stationData } from '../data/stations';
import { formatDuration } from '../lib/utils';
import { LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Trash2 } from 'lucide-react'; 
import SeinPanPyarImg from '../images/SeinPanPyar.jpeg';

const StationMap = dynamic(() => import('../components/StationMap'), { ssr: false, loading: () => <div className="h-[400px] w-full bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">Map Loading...</div> });
const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}></div>;

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'planner' | 'dashboard' | 'profile' | 'compare'>('planner');
  const [comparePriority, setComparePriority] = useState<'fast' | 'full'>('fast');

  // --- Store States ---
  const { isLoggedIn, setLogin, logout, currentUser, userProfile, initAuth } = useAppStore();
  const { activeSession, startActiveCharging, resumeActiveCharging, updateActiveCharging, stopActiveCharging } = useAppStore();

  const selectedStation = useAppStore((state) => state.selectedStation);
  const calcParams = useAppStore((state) => state.calcParams);
  const updateCalcParams = useAppStore((state) => state.updateCalcParams);
  const favoriteStations = useAppStore((state) => state.favoriteStations);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);

  const userUid = currentUser?.UID || currentUser?.uid || userProfile?.uid || 'UNKNOWN';
  const userIdentifier = (currentUser?.Phone || currentUser?.phone || "").toString().replace(/'/g, '').trim();

  // --- Auth States ---
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

  // --- Queue States ---
  const [trackingQueue, setTrackingQueue] = useState(false);
  const [initialQueueCount, setInitialQueueCount] = useState(0);
  const [queueStartTime, setQueueStartTime] = useState<Date | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [queueHistory, setQueueHistory] = useState<{ time: Date, remaining: number }[]>([]);

  // --- Charging Receipt & Loss ---
  const [energyLossKwh, setEnergyLossKwh] = useState<number>(0);
  const [syncPercentInput, setSyncPercentInput] = useState<string>('');
  const [syncKwhInput, setSyncKwhInput] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [finalReceiptData, setFinalReceiptData] = useState<any>(null);

  // --- Dropdown States ---
  const [stationSearch, setStationSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [stationModalInfo, setStationModalInfo] = useState<any | null>(null);

  // --- Dashboard Form States (Added date inputs) ---
  const [tripInput, setTripInput] = useState({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '', date: '' });
  const [statusInput, setStatusInput] = useState({ battery: '', range: '', soh: '', date: '' });

  // --- Logs States ---
  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [tripLogs, setTripLogs] = useState<any[]>([]);
  const [vehicleStatusLogs, setVehicleStatusLogs] = useState<any[]>([]);
  
  // 👈 NEW: Total Distance Logs State
  const [totalDistanceLogs, setTotalDistanceLogs] = useState<any[]>([]);
  const [tdInputDistance, setTdInputDistance] = useState('');
  const [tdInputDate, setTdInputDate] = useState('');

  // --- History Table States (Updated for multiple sorting options) ---
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<{key: 'date' | 'kwh', desc: boolean}>({key: 'date', desc: true}); // 👈 Default Date descending
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<any | null>(null);


  // === 1. Initial Load & Fetching ===
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
          
          const userQueueLogs = queueData.filter((log: any) => log.UID === userUid);
          const inProgressQueue = userQueueLogs.find((log: any) => log.Status === 'In Progress');
          if (inProgressQueue) {
            useAppStore.getState().updateCalcParams({ carsInQueue: Number(inProgressQueue.Initial_Cars) });
            setTrackingQueue(true);
            setActiveQueueId(inProgressQueue.ID);
            setInitialQueueCount(Number(inProgressQueue.Initial_Cars));
            setQueueStartTime(new Date(inProgressQueue.Date));

            const queueStationName = inProgressQueue.Station_Name || inProgressQueue.Station;
            if (queueStationName) {
              const foundStation = stationData.hits.hits.find(s => s._source.name_text === queueStationName);
              if (foundStation) {
                useAppStore.getState().setSelectedStation(foundStation);
                setStationSearch(foundStation._source.name_text);
              }
            }
          }
        }

        const cLogs = await fetchSheetData('Charging_Logs');
        if (Array.isArray(cLogs)) {
          const filteredCLogs = cLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setDashboardLogs(filteredCLogs);

          const inProgressCharge = filteredCLogs.find((log: any) => log.Status === 'In Progress');
          const localSession = useAppStore.getState().activeSession;

          if (inProgressCharge) {
            if (localSession.id !== inProgressCharge.ID) {
              resumeActiveCharging({
                id: inProgressCharge.ID,
                originalStartTime: new Date(inProgressCharge['Date & Time'] || inProgressCharge.Date).toISOString(),
                originalStartPercent: Number(inProgressCharge['Start%'] || inProgressCharge.Start_Percent),
                logs: JSON.parse(inProgressCharge.Timeline_Data || '[]')
              });
            }

            const chargeStationName = inProgressCharge.Station || inProgressCharge.Station_Name;
            if (chargeStationName) {
              const foundStation = stationData.hits.hits.find(s => s._source.name_text === chargeStationName);
              if (foundStation) {
                useAppStore.getState().setSelectedStation(foundStation);
                setStationSearch(foundStation._source.name_text);
              }
            }
          } else if (!inProgressCharge && useAppStore.getState().activeSession.isCharging) {
             stopActiveCharging();
          }
        }

        const tLogs = await fetchSheetData('Trip_Logs');
        if (Array.isArray(tLogs) && tLogs.length > 0) {
          const filteredTLogs = tLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setTripLogs(filteredTLogs);
          if (filteredTLogs.length > 0) {
            const sorted = [...filteredTLogs].sort((a, b) => new Date(b.Date || b.Time).getTime() - new Date(a.Date || a.Time).getTime());
            const latestDateStr = sorted[0]?.Date;
            if (latestDateStr) {
              const d = new Date(latestDateStr);
              if (!isNaN(d.getTime())) setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
          }
        }

        const vLogs = await fetchSheetData('Vehicle_Status');
        if (Array.isArray(vLogs)) {
          const filteredVLogs = vLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setVehicleStatusLogs(filteredVLogs);
        }

        // 👈 NEW: Fetch Total_Distance_Logs and set initial state
        const tdLogs = await fetchSheetData('Total_Distance_Logs');
        if (Array.isArray(tdLogs)) {
          const userTdLogs = tdLogs.filter((log: any) => log.UID === userUid || log.Phone?.toString().replace(/'/g, '') === userIdentifier);
          setTotalDistanceLogs(userTdLogs);
          if (userTdLogs.length > 0) {
            const sortedTd = [...userTdLogs].sort((a, b) => new Date(b.DateTime || b.Date_Time).getTime() - new Date(a.DateTime || a.Date_Time).getTime());
            useAppStore.getState().setUserProfile({ totalDistance: Number(sortedTd[0].Total_Distance) });
          }
        }

      } catch (error) {
        console.error("Data Fetch Error: ", error);
        setInitialLoadError("အင်တာနက်ချိတ်ဆက်မှု ပြဿနာကြောင့် ဒေတာအချို့ ဆွဲယူ၍မရပါ။");
      } finally {
        setIsDataLoading(false);
      }
    };

    if (isLoggedIn && mounted && userUid !== 'UNKNOWN') fetchInitialData();
  }, [isLoggedIn, mounted, currentUser, userUid, userIdentifier, resumeActiveCharging, stopActiveCharging]);


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


  const applyStationHours = (calcData: any, station: any) => {
    if (!calcData || !station || station._source.always_open__yes_no__boolean) return calcData;

    let extraMins = 0;
    let isClosedWarning = false;
    const source = station._source;

    const hoursText = source.opening_hours_text || "";
    let closeHr = 19, closeMin = 30; 
    const timeRegex = /(\d+):?(\d*)\s*(AM|PM)\s*TO\s*(\d+):?(\d*)\s*(AM|PM)/i;
    const match = hoursText.match(timeRegex);
    if (match) {
        closeHr = parseInt(match[4]) + (match[6].toUpperCase() === 'PM' && match[4] !== '12' ? 12 : 0);
        closeMin = match[5] ? parseInt(match[5]) : 0;
    }

    if (calcData.finishTimeStr) {
      const finishMatch = calcData.finishTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (finishMatch) {
          let fHr = parseInt(finishMatch[1]) + (finishMatch[3].toUpperCase() === 'PM' && finishMatch[1] !== '12' ? 12 : 0);
          let fMin = parseInt(finishMatch[2]);

          const hasBreak = source.has_break_time === true;
          if (hasBreak) {
              const bStartHr = source.break_start_hr || 14; 
              const bEndHr = source.break_end_hr || 15;     
              if (fHr >= bStartHr && fHr < bEndHr) {
                  const breakDuration = (bEndHr - bStartHr) * 60; 
                  extraMins = breakDuration;
                  fHr = bEndHr; 
                  const ampm = fHr >= 12 ? 'PM' : 'AM';
                  const disHr = fHr > 12 ? fHr - 12 : (fHr === 0 ? 12 : fHr);
                  calcData.finishTimeStr = `${disHr}:${fMin.toString().padStart(2, '0')} ${ampm}`;
              }
          }

          const finishTotalMins = fHr * 60 + fMin;
          const closeTotalMins = closeHr * 60 + closeMin;
          if (finishTotalMins > closeTotalMins) {
              isClosedWarning = true;
          }
      }
    }

    calcData.stationBreakMins = extraMins;
    calcData.stationClosedWarning = isClosedWarning;
    calcData.stationBreakText = source.break_time_text; 
    return calcData;
  };

  // === Calculator Auto Updates ===
  useEffect(() => {
    if (calcResult || activeSession.isCharging) {
      const baseTime = (trackingQueue && queueStartTime) ? queueStartTime : new Date();
      const limits = { maxSoc: selectedStation?._source?.max_soc_limit || undefined, maxMins: selectedStation?._source?.charge_time_limit_mins || undefined };
      let rawCalc = calculateCharging({ ...calcParams, hasBackupPower: selectedStation?._source?.has_backup_power || false }, baseTime, epcStatus, limits);
      rawCalc = applyStationHours(rawCalc, selectedStation);
      setCalcResult(rawCalc);
    }
  }, [calcParams, trackingQueue, queueStartTime, epcStatus, selectedStation, activeSession.isCharging]);


  // === Live Charging Simulator (Time-Delta Calculation & Curve) ===
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (activeSession.isCharging && activeSession.lastSyncTime) {
      timer = setInterval(() => {
        const now = new Date().getTime();
        const start = new Date(activeSession.lastSyncTime!).getTime();
        
        let simSoc = activeSession.lastSyncPercent;
        let simKwh = activeSession.lastSyncKwh;

        let minsPassed = Math.floor((now - start) / 60000);
        for(let m=0; m < minsPassed; m++) {
            let kw = getActiveKw(simSoc, calcParams.chargerKw, calcParams.isLeapmotorB10);
            simKwh += kw / 60;
            simSoc += (kw / 60) / calcParams.batteryCapacityKwh * 100;
        }
        
        let remainderSecs = ((now - start) / 1000) % 60;
        let kwRem = getActiveKw(simSoc, calcParams.chargerKw, calcParams.isLeapmotorB10);
        simKwh += kwRem * (remainderSecs / 3600);
        simSoc += (kwRem * (remainderSecs / 3600)) / calcParams.batteryCapacityKwh * 100;

        const newPercent = Math.min(100, Math.floor(simSoc));
        const newConsumedKwh = simKwh;

        if (newPercent !== calcParams.currentPercent) {
           const newLogs = [
             ...activeSession.logs.filter((l: any) => l.isManual), 
             { time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: newPercent, kwh: Number(newConsumedKwh.toFixed(2)), isManual: false }
           ];
           updateActiveCharging(newConsumedKwh, newPercent, newLogs);
        }

        const stationMaxSoc = selectedStation?._source?.max_soc_limit || 100;
        const stationTimeLimit = selectedStation?._source?.charge_time_limit_mins || Infinity;
        const totalChargeMins = (now - new Date(activeSession.originalStartTime!).getTime()) / 60000;

        let isFinished = false;
        if (calcParams.limitMode === 'percent' && newPercent >= calcParams.targetPercent) isFinished = true;
        if (calcParams.limitMode === 'time' && totalChargeMins >= calcParams.targetMins) isFinished = true;
        if (newPercent >= stationMaxSoc || totalChargeMins >= stationTimeLimit) isFinished = true;

        if (isFinished) {
          handleCompleteCharging(newPercent, newConsumedKwh);
        }
      }, 5000); 
    }

    return () => clearInterval(timer);
  }, [activeSession.isCharging, activeSession.lastSyncTime, activeSession.lastSyncPercent, activeSession.lastSyncKwh, activeSession.logs, calcParams, updateActiveCharging, selectedStation]);

  // --- Button Handlers ---
  const handleCalculate = () => {
    const limits = { maxSoc: selectedStation?._source?.max_soc_limit || undefined, maxMins: selectedStation?._source?.charge_time_limit_mins || undefined };
    let rawCalc = calculateCharging({ ...calcParams, hasBackupPower: selectedStation?._source?.has_backup_power || false }, (trackingQueue && queueStartTime) ? queueStartTime : new Date(), epcStatus, limits);
    rawCalc = applyStationHours(rawCalc, selectedStation);
    setCalcResult(rawCalc);
  };

  const startQueueTracking = async () => {
    if (!selectedStation) return alert("Station တစ်ခုကို ရွေးချယ်ပေးပါ။");
    if (calcParams.carsInQueue <= 0) return alert("ကားအနည်းဆုံး ၁ စီး ရှိရပါမည်။");
    const now = new Date();
    const qId = `Q-${Date.now()}`;

    setTrackingQueue(true); setActiveQueueId(qId); setInitialQueueCount(calcParams.carsInQueue); setQueueStartTime(now); setQueueHistory([{ time: now, remaining: calcParams.carsInQueue }]);

    try { 
      await appendSheetData('Queue_Logs', [qId, userUid, now.toLocaleString(), selectedStation._source.name_text, calcParams.carsInQueue, 0, 0, 'In Progress']);
    } catch (e) { }
  };

  const handleCarLeft = async () => {
    const remainingCars = Math.max(0, calcParams.carsInQueue - 1);
    const now = new Date(); updateCalcParams({ carsInQueue: remainingCars }); setQueueHistory(prev => [...prev, { time: now, remaining: remainingCars }]);
    
    if (remainingCars === 0 && queueStartTime) {
      setTrackingQueue(false);
      const safeTotalMins = Math.max(1, Math.round((now.getTime() - queueStartTime.getTime()) / 60000));
      try {
        if (activeQueueId) await deleteSheetData('Queue_Logs', activeQueueId);
        await appendSheetData('Queue_Logs', [`Q-${Date.now()}`, userUid, queueStartTime.toLocaleString(), selectedStation?._source?.name_text, initialQueueCount, safeTotalMins, Math.round(safeTotalMins / initialQueueCount), 'Completed']);
        setActiveQueueId(null);
      } catch (e) { }
      alert(`သင့်အလှည့်ရောက်ပါပြီ! အားစသွင်းနိုင်ပါပြီ။`);
    }
  };

  const startCharging = async () => {
    if (!selectedStation) return alert("Station အရင်ရွေးပါ။");

    if (activeQueueId) {
      await deleteSheetData('Queue_Logs', activeQueueId);
      setActiveQueueId(null);
      setTrackingQueue(false);
    }

    const chargeId = `C-${Date.now()}`;
    startActiveCharging(chargeId, calcParams.currentPercent); 
    setEnergyLossKwh(0);

    const initialData = { id: chargeId, station: selectedStation?._source?.name_text, vehicle: vehicleData.find(v => v.id === calcParams.vehicleId)?.brand, startPercent: calcParams.currentPercent, date: new Date().toLocaleString() };

    try {
      await appendSheetData('Charging_Logs', [initialData.id, userUid, calcParams.vehicleId, initialData.date, initialData.station, initialData.vehicle, initialData.startPercent, '', 0, 0, 0, '', 0, '[]', 'In Progress']);
    } catch (e) { console.error("Failed to sync initial state to DB"); }
  };

  const handleSyncData = () => {
    let newPercent = Number(syncPercentInput) || calcParams.currentPercent;
    let newKwh = Number(syncKwhInput) || activeSession.consumedKwh;
    
    if (newPercent > 0 || newKwh > 0) {
      const expectedKwh = ((newPercent - activeSession.originalStartPercent) / 100) * calcParams.batteryCapacityKwh;
      const loss = Math.max(0, newKwh - expectedKwh);
      setEnergyLossKwh(loss);
      
      const newManualLog = { 
        time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), 
        percent: newPercent, 
        kwh: Number(newKwh.toFixed(2)), 
        isManual: true 
      };
      
      const updatedLogs = [...activeSession.logs.filter((l:any) => l.isManual), newManualLog];
      
      useAppStore.getState().syncActiveCharging(newPercent, newKwh, updatedLogs);
      
      setSyncPercentInput(''); 
      setSyncKwhInput('');
      alert('Sync ပြုလုပ်ပြီးပါပြီ။ လေလွင့်ဆုံးရှုံးမှုနှင့် ကျန်ရှိချိန်များ အလိုအလျောက် Update ဖြစ်သွားပါမည်။');
    }
  };

  const handleCompleteCharging = async (finalPercent = calcParams.currentPercent, finalKwh = activeSession.consumedKwh) => {
    setShowReceipt(true);
    const actualMins = activeSession.originalStartTime ? Math.round((new Date().getTime() - new Date(activeSession.originalStartTime).getTime()) / 60000) : 0;

    const currentSessionId = activeSession.id; 

    const expectedKwh = ((finalPercent - activeSession.originalStartPercent) / 100) * calcParams.batteryCapacityKwh;
    const finalLoss = Math.max(0, finalKwh - expectedKwh);
    setEnergyLossKwh(finalLoss);

    const finalLogs = [...activeSession.logs.filter((log:any) => log.isManual), { time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), percent: finalPercent, kwh: Number(finalKwh.toFixed(2)), isManual: true }];

    const finalData = {
      station: selectedStation?._source?.name_text, vehicle: vehicleData.find(v => v.id === calcParams.vehicleId)?.brand + " " + vehicleData.find(v => v.id === calcParams.vehicleId)?.model,
      startPercent: activeSession.originalStartPercent, endPercent: finalPercent, kwh: Number(finalKwh.toFixed(2)), lossKwh: Number(finalLoss.toFixed(2)), actualMins: actualMins, predictedDuration: calcResult?.chargeDurationStr || '-', cost: Math.round(finalKwh * calcParams.pricePerKwh), date: new Date().toLocaleString(), timelineJson: JSON.stringify(finalLogs)
    };

    setFinalReceiptData(finalData);
    stopActiveCharging();

    try {
      if (currentSessionId) await deleteSheetData('Charging_Logs', currentSessionId);
      await appendSheetData('Charging_Logs', [`C-${Date.now()}`, userUid, calcParams.vehicleId, finalData.date, finalData.station, finalData.vehicle, finalData.startPercent, finalData.endPercent, finalData.kwh, finalData.lossKwh, finalData.actualMins, finalData.predictedDuration, finalData.cost, finalData.timelineJson, 'Completed']);
    } catch (e) { }
  };


  // 👈 NEW: Handle Save Trip Log with Total Distance Calculation Logic
  const handleSaveTripLog = async () => {
    if (!tripInput.distance || !tripInput.avgKwh || !tripInput.remainingPercent) return alert("အချက်အလက်များ အပြည့်အစုံထည့်ပါ။");
    
    // User selected date or current time
    const tripDate = tripInput.date ? new Date(tripInput.date) : new Date();
    const tTime = tripDate.getTime();

    const usedKwh = (Number(tripInput.distance) / 100) * Number(tripInput.avgKwh);
    const tripDataObj = {
      ID: `T-${Date.now()}`, UID: userUid, Date: tripDate.toLocaleString(), Distance_km: Number(tripInput.distance),
      Duration: `${Number(tripInput.durationHr) || 0}hr ${Number(tripInput.durationMin) || 0}mins`, Avg_Consumption: Number(tripInput.avgKwh), Used_kWh: Number(usedKwh.toFixed(2)),
      Efficiency: Number((100 / Number(tripInput.avgKwh)).toFixed(2)), Remaining_Percent: Number(tripInput.remainingPercent)
    };

    // --- ACTUAL DISTANCE CALCULATION ---
    // Find latest charge BEFORE this new trip
    const pastCharges = dashboardLogs.filter(c => (c.Status === 'Completed' || !c.Status || c.Status.trim() === '') && new Date(c['Date & Time'] || c.Date || c.Time).getTime() <= tTime);
    const latestCharge = pastCharges.sort((a,b) => new Date(b['Date & Time'] || b.Date || b.Time).getTime() - new Date(a['Date & Time'] || a.Date || a.Time).getTime())[0];
    const chargeTime = latestCharge ? new Date(latestCharge['Date & Time'] || latestCharge.Date || latestCharge.Time).getTime() : 0;
    
    // Find latest trip AFTER the latest charge but BEFORE this new trip
    const pastTrips = tripLogs.filter(t => new Date(t.Date || t.Time).getTime() <= tTime && new Date(t.Date || t.Time).getTime() >= chargeTime);
    const latestPastTrip = pastTrips.sort((a,b) => new Date(b.Date || b.Time).getTime() - new Date(a.Date || a.Time).getTime())[0];
    
    const baselineKm = latestPastTrip ? Number(latestPastTrip.Distance_km || latestPastTrip.Distance || 0) : 0;
    const currentOdo = Number(tripInput.distance);
    let actualDist = currentOdo - baselineKm;
    if (actualDist < 0) actualDist = currentOdo; // Fallback if data is weird

    try {
      await appendSheetData('Trip_Logs', Object.values(tripDataObj)); 
      setTripLogs(prev => [...prev, tripDataObj]); 

      // --- AUTO UPDATE TOTAL DISTANCE ---
      // Get the current latest Total Distance Record
      const sortedTd = [...totalDistanceLogs].sort((a, b) => new Date(b.DateTime || b.Date_Time).getTime() - new Date(a.DateTime || a.Date_Time).getTime());
      const latestTdRecord = sortedTd[0];
      const latestTdTime = latestTdRecord ? new Date(latestTdRecord.DateTime || latestTdRecord.Date_Time).getTime() : 0;
      
      // If this trip is newer than our latest Total Distance record, add it
      if (tTime > latestTdTime && actualDist > 0) {
         const currentTotal = latestTdRecord ? Number(latestTdRecord.Total_Distance) : userProfile.totalDistance;
         const newTotal = currentTotal + actualDist;
         const newTdId = `TD-${Date.now()}`;
         
         // Format: ID, UID, DateTime, Total_Distance
         await appendSheetData('Total_Distance_Logs', [newTdId, userUid, tripDate.toLocaleString(), newTotal]);
         setTotalDistanceLogs(prev => [...prev, { ID: newTdId, UID: userUid, DateTime: tripDate.toLocaleString(), Total_Distance: newTotal }]);
         useAppStore.getState().setUserProfile({ totalDistance: newTotal });
      }

      alert(`Trip မှတ်တမ်းတင်ပြီးပါပြီ!`); 
      setTripInput({ distance: '', durationHr: '', durationMin: '', avgKwh: '', remainingPercent: '', date: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  const handleSaveVehicleStatus = async () => {
    if (!statusInput.battery || !statusInput.range || !statusInput.soh) return alert("အချက်အလက်များ အပြည့်အစုံထည့်ပါ။");
    const vDate = statusInput.date ? new Date(statusInput.date) : new Date();
    const statusData = { ID: `V-${Date.now()}`, UID: userUid, Date: vDate.toLocaleString(), Battery_Percent: Number(statusInput.battery), Dash_Range_km: Number(statusInput.range), SOH_Percent: Number(statusInput.soh) };
    try {
      await appendSheetData('Vehicle_Status', Object.values(statusData)); setVehicleStatusLogs(prev => [...prev, statusData]); alert(`ကား ဒေတာ Sync လုပ်ပြီးပါပြီ!`); setStatusInput({ battery: '', range: '', soh: '', date: '' });
    } catch (e) { alert("Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။"); }
  };

  // 👈 NEW: Save Manual Total Distance directly from Profile Page
  const handleSaveTotalDistance = async () => {
    if (!tdInputDistance) return alert("Total Distance ထည့်ပါ။");
    const d = tdInputDate ? new Date(tdInputDate) : new Date();
    const newTd = {
      ID: `TD-${Date.now()}`,
      UID: userUid,
      DateTime: d.toLocaleString(),
      Total_Distance: Number(tdInputDistance)
    };
    try {
      await appendSheetData('Total_Distance_Logs', [newTd.ID, newTd.UID, newTd.DateTime, newTd.Total_Distance]);
      const newLogs = [...totalDistanceLogs, newTd];
      setTotalDistanceLogs(newLogs);
      
      // Update global state if this is the newest record
      const sortedTd = [...newLogs].sort((a, b) => new Date(b.DateTime || b.Date_Time).getTime() - new Date(a.DateTime || a.Date_Time).getTime());
      if (sortedTd[0].ID === newTd.ID) {
        useAppStore.getState().setUserProfile({ totalDistance: newTd.Total_Distance });
      }
      setTdInputDistance('');
      setTdInputDate('');
      alert('Total Distance Update လုပ်ပြီးပါပြီ။');
    } catch (e) {
      alert('Database သိမ်းဆည်းမှု မအောင်မြင်ပါ။');
    }
  };

  const handleDeleteRecord = async (sheetName: string, id: string) => {
    if (!confirm('ဤမှတ်တမ်းကို ဖျက်ရန် သေချာပြီလား?')) return;
    try {
      await deleteSheetData(sheetName, id);
      if (sheetName === 'Trip_Logs') setTripLogs(prev => prev.filter(log => log.ID !== id));
      if (sheetName === 'Charging_Logs') setDashboardLogs(prev => prev.filter(log => log.ID !== id));
      if (sheetName === 'Vehicle_Status') setVehicleStatusLogs(prev => prev.filter(log => log.ID !== id));
      if (sheetName === 'Total_Distance_Logs') setTotalDistanceLogs(prev => prev.filter(log => log.ID !== id));
      alert('မှတ်တမ်းဖျက်ပစ်ခြင်း အောင်မြင်ပါသည်။');
    } catch (e) {
      alert('ဖျက်ရာတွင် အခက်အခဲရှိနေပါသည်။');
    }
  };


  // ==========================================
  // Analytics Logic (Fixed Sorting Bug)
  // ==========================================
  const dashboardStats = useMemo(() => {
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
      const dStr = log['Date & Time'] || log.Date || log.Time;
      if (!dStr) return 0;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const unifiedTimeline: any[] = [];
    tripLogs.forEach(t => {
      const tTime = getT(t);
      if (tTime > 0) unifiedTimeline.push({ type: 'TRIP', time: tTime, data: t });
    });
    dashboardLogs.forEach(c => {
      const cTime = getT(c);
      if (cTime > 0 && (c.Status === 'Completed' || !c.Status || c.Status.trim() === '')) {
        unifiedTimeline.push({ type: 'CHARGE', time: cTime, data: c });
      }
    });

    unifiedTimeline.sort((a, b) => a.time - b.time);

    let baselineKm = 0;
    const processedTrips: any[] = [];

    unifiedTimeline.forEach(event => {
      if (event.type === 'CHARGE') {
        baselineKm = 0;
      } else if (event.type === 'TRIP') {
        const currentOdo = Number(event.data.Distance_km || event.data.Distance || event.data['Distance (km)'] || 0);
        let actualDist = currentOdo - baselineKm;
        if (actualDist < 0) actualDist = currentOdo;
        processedTrips.push({ ...event.data, actual_dist: actualDist, parsedMonth: safeDateParse(event.data.Date || event.data.Time) });
        baselineKm = currentOdo;
      }
    });

    const monthTrips = processedTrips.filter(t => t.parsedMonth === currentMonthFilter);
    const monthCharges = dashboardLogs.filter(c => safeDateParse(c.Date || c.Time || c['Date & Time']) === currentMonthFilter);

    const totalDist = monthTrips.reduce((sum, t) => sum + t.actual_dist, 0);
    const totalUsedKwh = monthTrips.reduce((sum, t) => sum + Number(t.Used_kWh || t.UsedkWh || t['Used kWh'] || 0), 0);
    const totalRecharged = monthCharges.reduce((sum, c) => sum + Number(c.Consumed_kWh || c.ConsumedkWh || c['Consumed kWh'] || c.kwh || 0), 0);
    const totalSpent = monthCharges.reduce((sum, c) => sum + Number(c.Cost || c.Total_Cost || c['Total Cost'] || 0), 0);

    const MAX_RANGE_KM = 440.22;
    const autoSOH = Math.max(80, 100 - (userProfile.totalDistance / 20000));

    const sortedTrips = [...tripLogs].sort((a, b) => getT(b) - getT(a));
    const latestTrip = sortedTrips[0];

    const validCharges = dashboardLogs.filter(c => c.Status === 'Completed' || !c.Status || c.Status.trim() === '');
    const sortedCharges = [...validCharges].sort((a, b) => getT(b) - getT(a));
    const latestCharge = sortedCharges[0];

    const sortedStatus = [...vehicleStatusLogs].sort((a, b) => getT(b) - getT(a));
    const latestStatus = sortedStatus[0];

    const maxTime = Math.max(getT(latestTrip), getT(latestCharge), getT(latestStatus));

    let currentBattery = 0;
    let currentRange = 0;
    let rangeSource = "Estimated";
    let currentSOH = autoSOH;

    if (maxTime > 0) {
      if (getT(latestStatus) === maxTime && latestStatus) {
        currentBattery = Number(latestStatus.Battery_Percent || latestStatus.Battery || 0);
        currentRange = Number(latestStatus.Dash_Range_km || latestStatus.Range || 0);
        currentSOH = Number(latestStatus.SOH_Percent || latestStatus.SOH || autoSOH);
        rangeSource = "Car Sync";
      } else if (getT(latestTrip) === maxTime && latestTrip) {
        currentBattery = Number(latestTrip.Remaining_Percent || latestTrip['Remaining Percent'] || 0);
        rangeSource = "Since Last Trip";
      } else if (getT(latestCharge) === maxTime && latestCharge) {
        currentBattery = Number(latestCharge.End_Percent || latestCharge['End%'] || 0);
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
    if (dashboardStats.currentBattery > 0 && !activeSession.isCharging) {
      updateCalcParams({ currentPercent: dashboardStats.currentBattery });
    }
  }, [dashboardStats.currentBattery, activeSession.isCharging, updateCalcParams]);

  const filteredStations = useMemo(() => {
    if (!stationSearch.trim()) return [];
    return stationData.hits.hits.filter(s => s._source.name_text.toLowerCase().includes(stationSearch.toLowerCase()));
  }, [stationSearch]);

  // 👈 NEW: Charging History Sorting Logic with Multiple Options
  const sortedHistoryLogs = useMemo(() => {
    return dashboardLogs
      .filter(log => {
        const dateVal = log['Date & Time'] || log.Date || log.Time || '';
        return String(dateVal).toLowerCase().includes(historySearch.toLowerCase());
      })
      .sort((a, b) => {
        if (historySort.key === 'kwh') {
          const valA = Number(a.Consumed_kWh || a.ConsumedkWh || a['Consumed kWh'] || a.kwh || 0);
          const valB = Number(b.Consumed_kWh || b.ConsumedkWh || b['Consumed kWh'] || b.kwh || 0);
          return historySort.desc ? valB - valA : valA - valB;
        } else {
          const valA = new Date(a['Date & Time'] || a.Date || a.Time).getTime();
          const valB = new Date(b['Date & Time'] || b.Date || b.Time).getTime();
          return historySort.desc ? valB - valA : valA - valB;
        }
      });
  }, [dashboardLogs, historySearch, historySort]);


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
      <nav className="hidden md:flex bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto w-full px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">EV Planner</h1>
          <div className="flex gap-6 items-center">
            <button onClick={() => setActiveTab('planner')} className={`font-bold transition ${activeTab === 'planner' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Planner</button>
            <button onClick={() => setActiveTab('dashboard')} className={`font-bold transition ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Dashboard</button>
            <button onClick={() => setActiveTab('profile')} className={`font-bold transition ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Profile</button>
            <button onClick={() => setActiveTab('compare')} className={`font-bold transition ${activeTab === 'compare' ? 'text-purple-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>Compare</button>
            {mounted && <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="ml-4 p-2 bg-gray-100 dark:bg-gray-700 rounded-full">{theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}</button>}
          </div>
        </div>
      </nav>

      <div className="md:hidden bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">EV Planner</h1>
        {mounted && <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">{theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}</button>}
      </div>

      {initialLoadError && <div className="max-w-4xl mx-auto mt-4 px-4"><div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm flex gap-2 items-center"><AlertTriangle size={18} /> {initialLoadError}</div></div>}

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">

        {/* TAB 1: PLANNER */}
        {activeTab === 'planner' && (
          <div className="space-y-8">
            {!activeSession.isCharging && !showReceipt && (
              <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white"><MapPin className="text-red-500" /> EV Stations Map</h2>
                <StationMap />
              </section>
            )}

            {!activeSession.isCharging && !showReceipt && (
              <section className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-2xl font-black mb-6 flex items-center gap-2 dark:text-white"><BatteryCharging className="text-green-500" /> Charging Calculator</h2>

                <div className="relative mb-6">
                  <label className="block text-sm font-bold mb-2 text-gray-500">Station ရွေးချယ်ရန်</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input type="text" placeholder="Station အမည်ဖြင့် ရှာဖွေပါ..." 
                      className="w-full border p-3 pl-10 pr-10 rounded-xl dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium transition" 
                      value={stationSearch}
                      onChange={(e) => { 
                        setStationSearch(e.target.value); 
                        setIsDropdownOpen(e.target.value.trim().length > 0); 
                        if (e.target.value.trim() === '') {
                           useAppStore.getState().setSelectedStation(null); 
                           setCalcResult(null);
                        }
                      }}
                      onFocus={() => { 
                        if(stationSearch.trim().length > 0) setIsDropdownOpen(true); 
                      }}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                    />
                    {selectedStation && (
                      <button 
                        onClick={() => {
                          useAppStore.getState().setSelectedStation(null);
                          setStationSearch('');
                          setCalcResult(null);
                        }}
                        className="absolute right-10 top-3 text-red-400 hover:text-red-600"
                      >
                        <X size={18} />
                      </button>
                    )}
                    <ChevronDown className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18} />
                  </div>
                  {isDropdownOpen && stationSearch.trim().length > 0 && (
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
                  <div className="animate-in fade-in duration-500">
                    <div className="mb-6 overflow-hidden bg-white dark:bg-gray-800 border-2 border-blue-100 dark:border-gray-700 rounded-3xl shadow-sm">
                      {selectedStation._source.photos_list_image?.[0] && (
                        <img
                          src={selectedStation._source.photos_list_image[0]}
                          alt={selectedStation._source.name_text}
                          className="w-full h-56 object-cover object-center"
                        />
                      )}

                      <div className="p-5 md:p-6">
                        <div className="flex justify-between items-start mb-5">
                          <div>
                            <h3 className="font-black text-xl text-gray-800 dark:text-white flex items-center gap-2">
                              <MapPin className="text-blue-500 shrink-0" size={22} /> {selectedStation._source.name_text}
                            </h3>
                            <p className="text-sm text-gray-500 font-medium mt-1 pl-7">{selectedStation._source.address_text}</p>
                          </div>
                          <button onClick={() => toggleFavorite(selectedStation._id)} className={`p-3 rounded-full transition-colors shadow-sm shrink-0 ${favoriteStations.includes(selectedStation._id) ? 'bg-red-100 text-red-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-gray-200'}`}>
                            <Heart size={20} fill={favoriteStations.includes(selectedStation._id) ? 'currentColor' : 'none'} />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 text-sm bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800">
                          <div>
                            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock size={14} /> ဖွင့်ချိန်/ပိတ်ချိန်</span>
                            <strong className="dark:text-white">{selectedStation._source.always_open__yes_no__boolean ? '24 Hours (အမြဲဖွင့်သည်)' : selectedStation._source.opening_hours_text}</strong>
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Zap size={14} /> ဈေးနှုန်း (1 kWh)</span>
                            <strong className="text-green-600 dark:text-green-400 text-lg">{selectedStation._source.price_text} Ks</strong>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Info size={14} /> ဆက်သွယ်ရန်</span>
                            <strong className="dark:text-white">{selectedStation._source.phone_number_text || 'ဖုန်းနံပါတ်မရှိပါ'}</strong>
                          </div>

                          <div className="col-span-2 md:col-span-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-2 flex flex-wrap gap-2 items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">ဝန်ဆောင်မှုများ:</span>
                            {selectedStation._source.station__ac_dc__option_ac_dc_station === 'dc' && (
                              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-200 dark:border-blue-800 shadow-sm">⚡ DC Fast Charging</span>
                            )}
                            {selectedStation._source.has_backup_power && (
                              <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-200 dark:border-green-800 shadow-sm">✓ 24hr Backup Power</span>
                            )}
                            {selectedStation._source.list_of_plugs_types_list_option_plug_types?.map((plug: string) => (
                              <span key={plug} className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold uppercase border border-gray-300 dark:border-gray-600 shadow-sm">
                                🔌 {plug.replace('dc_', '').replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

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
                        <div className="relative">
                          <input type="number" list="charger-speeds" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Speed ရွေးပါ သို့မဟုတ် ရိုက်ထည့်ပါ" value={calcParams.chargerKw} onChange={(e) => updateCalcParams({ chargerKw: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if (!calcParams.chargerKw || Number(calcParams.chargerKw) <= 0) updateCalcParams({ chargerKw: 30 }) }} />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><ChevronDown size={18} /></div>
                          <datalist id="charger-speeds"><option value={30}>30 kW</option><option value={40}>40 kW</option><option value={50}>50 kW</option><option value={60}>60 kW</option><option value={120}>120 kW</option></datalist>
                        </div>
                      </div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">တစ်ပြိုင်နက်သွင်းနိုင်သော အစီးအရေ</label><input type="number" min="1" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.activePorts} onChange={e => updateCalcParams({ activePorts: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if ((calcParams.activePorts as any) === '' || Number(calcParams.activePorts) < 1) updateCalcParams({ activePorts: 1 }) }} /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">ရှေ့တွင်စောင့်နေသော ကား (စီး)</label><input type="number" min="0" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-medium outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.carsInQueue} onChange={e => updateCalcParams({ carsInQueue: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if ((calcParams.carsInQueue as any) === '' || Number(calcParams.carsInQueue) < 0) updateCalcParams({ carsInQueue: 0 }) }} /></div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Current Battery %</label>
                        <input type="number" className="w-full border p-4 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500" value={calcParams.currentPercent} onChange={e => updateCalcParams({ currentPercent: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if ((calcParams.currentPercent as any) === '' || Number(calcParams.currentPercent) < 0) updateCalcParams({ currentPercent: 0 }); else if (Number(calcParams.currentPercent) > 100) updateCalcParams({ currentPercent: 100 }); }} />
                      </div>
                      
                      <div className="md:col-span-2 bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 mt-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">အားသွင်းမည့် ပမာဏ သတ်မှတ်ရန် (ရွေးချယ်ပါ)</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div onClick={() => updateCalcParams({ limitMode: 'percent' })} className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${calcParams.limitMode === 'percent' ? 'border-green-500 bg-green-50/80 dark:bg-green-900/30 shadow-md' : 'border-transparent bg-white dark:bg-gray-800 opacity-60 hover:opacity-100'}`}>
                            <div className="absolute top-4 right-4"><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${calcParams.limitMode === 'percent' ? 'border-green-500' : 'border-gray-400'}`}>{calcParams.limitMode === 'percent' && <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>}</div></div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide cursor-pointer">Target Battery %</label>
                            <input type="number" disabled={calcParams.limitMode !== 'percent'} className="w-full border p-3 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-black text-green-600 outline-none focus:ring-2 focus:ring-green-500 bg-white disabled:bg-gray-100 dark:disabled:bg-gray-800 transition-colors" value={calcParams.targetPercent} onChange={e => updateCalcParams({ targetPercent: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if ((calcParams.targetPercent as any) === '' || Number(calcParams.targetPercent) < 1) updateCalcParams({ targetPercent: 80 }); else if (Number(calcParams.targetPercent) > 100) updateCalcParams({ targetPercent: 100 }); }} />
                          </div>
                          <div onClick={() => updateCalcParams({ limitMode: 'time' })} className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${calcParams.limitMode === 'time' ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-md' : 'border-transparent bg-white dark:bg-gray-800 opacity-60 hover:opacity-100'}`}>
                            <div className="absolute top-4 right-4"><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${calcParams.limitMode === 'time' ? 'border-blue-500' : 'border-gray-400'}`}>{calcParams.limitMode === 'time' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}</div></div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide cursor-pointer">အားသွင်းမည့် ကြာချိန် (Minutes)</label>
                            <input type="number" disabled={calcParams.limitMode !== 'time'} className="w-full border p-3 rounded-xl dark:bg-gray-900 dark:border-gray-700 font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 dark:disabled:bg-gray-800 transition-colors" value={calcParams.targetMins} onChange={e => updateCalcParams({ targetMins: e.target.value === '' ? '' as any : Number(e.target.value) })} onBlur={() => { if ((calcParams.targetMins as any) === '' || Number(calcParams.targetMins) < 1) updateCalcParams({ targetMins: 45 }); }} />
                            {selectedStation?._source?.charge_time_limit_mins && (<p className="text-[10px] text-blue-700 font-bold mt-2 bg-blue-100 dark:bg-blue-900/50 inline-block px-2 py-1 rounded-md">Station Limit: {selectedStation._source.charge_time_limit_mins} mins အထိသာ</p>)}
                          </div>
                        </div>
                      </div>
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
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                            <p className="text-xs text-gray-500 font-bold uppercase mb-1">ခန့်မှန်း ရရှိမည့် %</p>
                            <p className="text-3xl font-black text-green-600">{calcResult.finalSoc}%</p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                            <p className="text-xs text-gray-500 font-bold uppercase mb-1">ခန့်မှန်း ကုန်ကျစရိတ်</p>
                            <p className="text-2xl font-black text-blue-600 mt-1">{calcResult.estimatedCost.toLocaleString()} <span className="text-sm font-bold text-gray-400">Ks</span></p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 col-span-2 flex justify-between items-center">
                            <div>
                              <p className="text-xs text-gray-500 font-bold uppercase mb-1">ဝင်ရောက်မည့် စွမ်းအင်</p>
                              <p className="text-xl font-black dark:text-white">{calcResult.consumedKwh.toFixed(2)} kWh</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 font-bold uppercase mb-1">အားသွင်းမည့် ကြာချိန်</p>
                              <p className="text-xl font-black text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded-lg inline-block">{calcResult.chargeDurationStr}</p>
                            </div>
                          </div>
                        </div>

                        {calcResult.blackoutMins > 0 && <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl text-red-700 text-sm font-bold flex gap-2"><AlertTriangle size={18} className="shrink-0" /> EPC မီးပျက်ချိန် {formatDuration(calcResult.blackoutMins / 60)} ပါဝင်သွားသဖြင့် အချိန်ပိုကြာပါမည်။</div>}
                        {calcResult.stationBreakMins > 0 && (
                          <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 rounded-xl text-orange-700 text-sm font-bold flex gap-2">
                            <Clock size={18} className="shrink-0" /> ဆိုင်၏ နားချိန် ({calcResult.stationBreakText || 'နေ့လည်'}) နှင့် တိုက်ဆိုင်နေသဖြင့် အားသွင်းကြာချိန် ပိုမိုကြာမြင့်ပါမည်။
                          </div>
                        )}
                        {calcResult.stationClosedWarning && (
                          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl text-red-700 text-sm font-bold flex gap-2">
                            <AlertTriangle size={18} className="shrink-0" /> ⚠️ သတိပြုရန်: ဤအချိန်ဇယားအရ ဆိုင်ပိတ်ချိန်ကို ကျော်လွန်သွားမည်ဖြစ်သဖြင့် နောက်နေ့ ဆိုင်ဖွင့်မှသာ အားဆက်သွင်းနိုင်ပါမည်။
                          </div>
                        )}
                        {!selectedStation?._source?.always_open__yes_no__boolean && (
                          <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 rounded-xl text-orange-700 text-sm font-bold flex gap-2">
                            <Clock size={18} className="shrink-0" /> ဤ Station သည် 24 နာရီဖွင့်လှစ်ခြင်းမရှိပါ။ နေ့လည် (၂ နာရီမှ ၃ နာရီ) နားချိန် သို့မဟုတ် ဆိုင်ပိတ်ချိန်နှင့် တိုက်ဆိုင်ပါက အထက်ပါကြာချိန်ထက် ပိုမိုကြာမြင့်နိုင်ပါသည်။
                          </div>
                        )}

                        <div className="space-y-5 text-sm md:text-base font-medium text-gray-600 dark:text-gray-300">
                          <div className="flex justify-between items-center"><span className="flex items-center gap-2"><Clock size={18} /> ကားစောင့်ရမည့် ကြာချိန်</span><span className="font-black text-orange-500 text-lg bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-lg">{calcResult.waitDurationStr}</span></div>
                          <div className="flex justify-between items-center"><span className="flex items-center gap-2"><Calendar size={18} /> အားစသွင်းရမည့် အချိန်</span><span className="font-black text-gray-800 dark:text-white text-lg">{calcResult.startTimeStr}</span></div>
                          <div className="flex justify-between items-center pt-5 border-t border-gray-200 dark:border-gray-700"><span className="font-black text-gray-800 dark:text-white">ပြီးဆုံးမည့် အချိန် (Finish)</span><span className="text-xl font-black text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-4 py-1.5 rounded-xl">{calcResult.finishTimeStr}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {activeSession.isCharging && (
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
                    <p className="font-black text-2xl text-green-600 dark:text-green-400 mt-1">{activeSession.consumedKwh.toFixed(2)} <span className="text-sm font-normal">kWh</span></p>
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

                <button onClick={() => handleCompleteCharging(calcParams.currentPercent, activeSession.consumedKwh)} className="w-full bg-red-500 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-red-600 transition">အားသွင်းခြင်း ရပ်မည် (Stop)</button>
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
                    <LineChart data={JSON.parse(finalReceiptData.timelineJson)}>
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

                <button onClick={() => setShowReceipt(false)} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition">ပင်မစာမျက်နှာသို့ ပြန်သွားမည်</button>
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
                    {/* 👈 NEW: Added Date Picker for Trip Log */}
                    <div className="col-span-2"><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Date & Time</label><input type="datetime-local" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-blue-500" value={tripInput.date} onChange={e => setTripInput({ ...tripInput, date: e.target.value })} /></div>
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
                  <div className="grid grid-cols-2 gap-5 mb-6">
                    {/* 👈 NEW: Added Date Picker for Car Sync */}
                    <div className="col-span-2"><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Date & Time</label><input type="datetime-local" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold outline-none focus:border-indigo-500" value={statusInput.date} onChange={e => setStatusInput({ ...statusInput, date: e.target.value })} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">လက်ရှိ Battery (%)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-black text-indigo-600 outline-none focus:border-indigo-500" value={statusInput.battery} onChange={e => setStatusInput({ ...statusInput, battery: e.target.value, soh: '100' })} /></div>
                    <div><label className="block text-xs font-bold mb-2 text-gray-600 dark:text-gray-400 uppercase tracking-wide">Dashboard Range (km)</label><input type="number" className="w-full border-2 border-white dark:border-gray-700 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm font-bold text-green-600 outline-none focus:border-indigo-500" value={statusInput.range} onChange={e => setStatusInput({ ...statusInput, range: e.target.value })} /></div>
                  </div>
                  <button onClick={handleSaveVehicleStatus} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg hover:bg-indigo-700 transition mb-6">ကား ဒေတာ Sync လုပ်မည်</button>

                  <div className="space-y-3 mt-4 max-h-40 overflow-y-auto pr-2">
                    <p className="text-xs font-bold text-gray-500 uppercase">Sync လုပ်ထားသော မှတ်တမ်းများ</p>
                    {vehicleStatusLogs.slice().reverse().slice(0, 3).map((vLog: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="text-sm">
                          <p className="font-bold text-indigo-600 dark:text-indigo-400">{vLog.Battery_Percent}% <span className="text-gray-400">|</span> {vLog.Dash_Range_km} km</p>
                          <p className="text-xs text-gray-500">{vLog.Date}</p>
                        </div>
                        <button onClick={() => handleDeleteRecord('Vehicle_Status', vLog.ID)} className="text-red-400 hover:text-red-600 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg transition"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mt-8">
              <div className="p-6 md:p-8 border-b dark:border-gray-700"><h3 className="font-black text-xl flex items-center gap-3"><List size={24} className="text-blue-500" /> Trip History Table</h3></div>
              <div className="overflow-x-auto p-4 md:p-6">
                <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead className="text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                    <tr><th className="p-4 rounded-l-2xl font-bold uppercase tracking-wider text-xs">Date</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Actual Dist.</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Avg kWh</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Bat %</th><th className="p-4 rounded-r-2xl text-center"></th></tr>
                  </thead>
                  <tbody>
                    {dashboardStats.processedTrips.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold">No Trip Records</td></tr> : dashboardStats.processedTrips.slice().reverse().slice(0, 5).map((log, idx) => (
                      <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 shadow-sm transition-all rounded-2xl group">
                        <td className="p-4 rounded-l-2xl font-medium text-gray-600 dark:text-gray-300">{log.Date || log.Time}</td>
                        <td className="p-4 font-black text-lg text-blue-600">{log.actual_dist} <span className="text-sm font-medium text-gray-400">km</span></td>
                        <td className="p-4 font-bold text-orange-500">{log.Avg_Consumption || log.AvgConsumption || 0}</td>
                        <td className="p-4 font-black text-green-500 bg-green-50/50 dark:bg-green-900/10 group-hover:bg-green-50">{log.Remaining_Percent || log['Remaining Percent'] || 0}%</td>
                        <td className="p-4 rounded-r-2xl text-right">
                          <button onClick={() => handleDeleteRecord('Trip_Logs', log.ID)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 p-2 rounded-lg transition"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-black text-xl dark:text-white px-2 mb-6 flex items-center gap-3"><History size={24} className="text-blue-500" /> အားသွင်းမှု မှတ်တမ်းများ (Charging History)</h3>
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden p-6 md:p-8">
                
                {/* 👈 NEW: Advanced Sorting Toggles for History Table */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input type="text" placeholder="ရက်စွဲ သို့မဟုတ် Station ဖြင့် ရှာရန်..." className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-900 outline-none focus:border-blue-500 font-medium transition" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    <button onClick={() => setHistorySort({ key: 'date', desc: historySort.key === 'date' ? !historySort.desc : true })} className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-2xl font-bold transition whitespace-nowrap ${historySort.key === 'date' ? 'bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-400' : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500'}`}>
                      <Calendar size={18} /> Date {historySort.key === 'date' && (historySort.desc ? '↓' : '↑')}
                    </button>
                    <button onClick={() => setHistorySort({ key: 'kwh', desc: historySort.key === 'kwh' ? !historySort.desc : true })} className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-2xl font-bold transition whitespace-nowrap ${historySort.key === 'kwh' ? 'bg-green-50 border-green-500 text-green-600 dark:bg-green-900/30 dark:border-green-500 dark:text-green-400' : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500'}`}>
                      <Zap size={18} /> kWh {historySort.key === 'kwh' && (historySort.desc ? '↓' : '↑')}
                    </button>
                  </div>
                </div>

                {isDataLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-separate border-spacing-y-3">
                      <thead className="text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                        <tr><th className="p-4 rounded-l-2xl font-bold uppercase tracking-wider text-xs">Date / Time</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Station</th><th className="p-4 font-bold uppercase tracking-wider text-xs">Battery %</th><th className="p-4 font-bold uppercase tracking-wider text-xs text-right">kWh</th><th className="p-4 rounded-r-2xl"></th></tr>
                      </thead>
                      <tbody>
                        {sortedHistoryLogs.length === 0 ? (
                          <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold bg-gray-50 dark:bg-gray-800 rounded-2xl">မှတ်တမ်းမရှိသေးပါ</td></tr>
                        ) : (
                          sortedHistoryLogs.map((log, idx) => (
                            <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700/50 shadow-sm border border-gray-100 dark:border-gray-700 rounded-2xl transition-all transform hover:scale-[1.01]">
                              <td onClick={() => { if (log.Timeline_Data) setSelectedHistoryLog(log); }} className="p-4 rounded-l-2xl whitespace-nowrap font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
                                <Clock size={14} className="inline mr-2 text-gray-400" />
                                {log['Date & Time'] || log.Date || log.Time || '-'}
                              </td>
                              <td onClick={() => { if (log.Timeline_Data) setSelectedHistoryLog(log); }} className="p-4 font-bold text-gray-800 dark:text-white cursor-pointer">{log.Station_Name || log.Station || '-'}</td>
                              <td className="p-4 font-bold text-gray-500">{log.Start_Percent || log['Start%'] || '-'}% <span className="text-gray-300 mx-1">➔</span> {log.End_Percent || log['End%'] || '-'}%</td>
                              <td className="p-4 text-right font-black text-lg text-blue-600 bg-blue-50/50 dark:bg-blue-900/10">+{log.Consumed_kWh || log.ConsumedkWh || log['Consumed kWh'] || log.kwh || 0}</td>
                              <td className="p-4 rounded-r-2xl text-center">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord('Charging_Logs', log.ID); }} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 p-2 rounded-lg transition"><Trash2 size={16} /></button>
                              </td>
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
                        <div style={{ width: '100%', height: '280px', minHeight: '280px' }} className="bg-white dark:bg-gray-900 p-4 rounded-3xl border border-gray-100 dark:border-gray-800">
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
              <div
                className="h-40 bg-cover bg-center w-full"
                style={{ backgroundImage: `url(${SeinPanPyarImg.src})` }}
              ></div>
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
              
              {/* 👈 NEW: Total Distance Form & Table in Profile */}
              <div className="px-8 mt-8">
                <h3 className="font-black text-lg mb-4 dark:text-white flex items-center gap-2"><Route className="text-blue-500" /> Update Total Distance</h3>
                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Date & Time</label>
                      <input type="datetime-local" className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 outline-none focus:border-blue-500 bg-white" value={tdInputDate} onChange={e => setTdInputDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Total Distance (km)</label>
                      <input type="number" className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 outline-none focus:border-blue-500 font-bold bg-white" placeholder="e.g. 15200" value={tdInputDistance} onChange={e => setTdInputDistance(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={handleSaveTotalDistance} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-blue-700 transition">Update Record</button>
                </div>
                
                <h3 className="font-bold text-md mb-3 dark:text-white text-gray-600">History Logs</h3>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8 max-h-60 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 sticky top-0 z-10">
                      <tr><th className="p-3 font-bold uppercase text-xs">Date / Time</th><th className="p-3 font-bold uppercase text-xs text-right">Total ODO (km)</th><th className="p-3 text-center"></th></tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {totalDistanceLogs.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-gray-400">No records found</td></tr>
                      ) : (
                        [...totalDistanceLogs].sort((a,b) => new Date(b.DateTime || b.Date_Time).getTime() - new Date(a.DateTime || a.Date_Time).getTime()).map((log, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                            <td className="p-3 text-gray-600 dark:text-gray-300 font-medium">{log.DateTime || log.Date_Time}</td>
                            <td className="p-3 text-right font-black text-blue-600">{Number(log.Total_Distance).toLocaleString()}</td>
                            <td className="p-3 text-center"><button onClick={() => handleDeleteRecord('Total_Distance_Logs', log.ID)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-8 mt-4">
                <button onClick={logout} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-100 dark:hover:bg-red-900/40 transition"><LogOut size={20} /> Logout Account</button>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: COMPARE & RECOMMENDATION */}
        {activeTab === 'compare' && (
          <section className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h2 className="text-2xl font-black mb-6 flex items-center gap-2 dark:text-white"><Route className="text-purple-500" /> AI Station Recommendations</h2>
              
              <div className="mb-8">
                <label className="block text-sm font-bold mb-4 text-gray-600 dark:text-gray-300">သင်၏ အဓိက လိုအပ်ချက်ကို ရွေးချယ်ပါ</label>
                <div className="flex flex-col md:flex-row gap-4">
                  <button onClick={() => setComparePriority('fast')} className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all border-2 ${comparePriority === 'fast' ? 'bg-purple-100 border-purple-500 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>⚡ အချိန်မြန်မြန်ရဖို့ (Speed)</button>
                  <button onClick={() => setComparePriority('full')} className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all border-2 ${comparePriority === 'full' ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>🔋 အားအများဆုံးရဖို့ (Max Charge)</button>
                </div>
              </div>

              <div className="space-y-6">
                {stationData.hits.hits.map(station => {
                  const limits = { maxSoc: station._source.max_soc_limit || undefined, maxMins: station._source.charge_time_limit_mins || undefined };
                  let result = calculateCharging({ ...calcParams, hasBackupPower: station._source.has_backup_power || false }, new Date(), epcStatus, limits);
                  result = applyStationHours(result, station);
                  
                  let score = 100;
                  if (comparePriority === 'fast') score -= (result.actualChargeMins * 0.5); 
                  if (comparePriority === 'full') score -= ((calcParams.targetPercent - result.finalSoc) * 2); 

                  return (
                    <div key={station._id} className="relative bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 md:p-6 overflow-hidden">
                      {score > 90 && <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-wider">Top Choice</div>}
                      
                      <h3 className="font-black text-lg mb-2 dark:text-white flex items-start justify-between">
                        <span>{station._source.name_text}</span>
                        <span className="text-xl text-purple-500 font-black">{Math.round(score)} Pt</span>
                      </h3>
                      
                      {limits.maxMins && (
                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-blue-700 text-sm font-bold rounded-xl flex gap-2">
                           <Info size={18} className="shrink-0"/> ဤဆိုင်သည် {limits.maxMins} မိနစ်သာ အားသွင်းခွင့်ရှိပါသည်။ နောက် {limits.maxMins} မိနစ်အကြာတွင် သင်၏ကားသည် {result.finalSoc}% အထိသာ ရရှိနိုင်ပါမည်။
                        </div>
                      )}
                      
                      {limits.maxSoc && limits.maxSoc < 100 && (
                        <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 text-orange-700 text-sm font-bold rounded-xl flex gap-2">
                           <Info size={18} className="shrink-0"/> ဤဆိုင်သည် {limits.maxSoc}% အထိသာ အားသွင်းခွင့်ပြုပါသည်။
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm"><span className="block text-gray-400 text-xs mb-1 uppercase font-bold">ရရှိမည့် %</span><strong className="text-green-600 text-lg">{result.finalSoc}%</strong></div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm"><span className="block text-gray-400 text-xs mb-1 uppercase font-bold">ကြာချိန်</span><strong className="text-blue-600 text-lg">{result.chargeDurationStr}</strong></div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm"><span className="block text-gray-400 text-xs mb-1 uppercase font-bold">ပြီးဆုံးမည့်အချိန်</span><strong className="dark:text-white">{result.finishTimeStr}</strong></div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm"><span className="block text-gray-400 text-xs mb-1 uppercase font-bold">24hr Backup</span><strong className="dark:text-white">{station._source.has_backup_power ? 'Yes' : 'No'}</strong></div>
                      </div>
                    </div>
                  );
                })}
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
        <button onClick={() => setActiveTab('compare')} className={`flex flex-col items-center gap-1.5 w-full py-2 transition-transform active:scale-95 ${activeTab === 'compare' ? 'text-purple-600' : 'text-gray-400'}`}>
          <div className={`p-1.5 rounded-full ${activeTab === 'compare' ? 'bg-purple-50 dark:bg-purple-900/30' : ''}`}><Route size={24} className={activeTab === 'compare' ? 'fill-purple-100 dark:fill-purple-900/50' : ''} /></div><span className="text-[10px] font-black uppercase tracking-wider">Compare</span>
        </button>
      </div>

    </main>
  );
}
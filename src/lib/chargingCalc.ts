import { EPCStatus, getNextEPCStatusChange } from './epcSchedule';

export interface ChargeParams {
  vehicleId: string;
  currentPercent: number;
  targetPercent: number;
  targetMins: number;           // 👈 Time limit အတွက်
  limitMode: 'percent' | 'time';// 👈 Mode ခွဲရန်
  batteryCapacityKwh: number;
  chargerKw: number;
  isLeapmotorB10: boolean;
  pricePerKwh: number;
  carsInQueue: number;
  activePorts: number;
  avgWaitTimePerCarMins: number;
}

// Leapmotor B10 ရဲ့ Real-world Charging Curve
export const leapmotorB10_Curve = [
  { soc: 0, max_kw: 80 }, { soc: 82, max_kw: 80 },
  { soc: 85, max_kw: 60 }, { soc: 88, max_kw: 40 },
  { soc: 90, max_kw: 29 }, { soc: 98, max_kw: 24 },
  { soc: 99, max_kw: 15 }, { soc: 100, max_kw: 5 }
];

export function getActiveKw(currentSoc: number, baseKw: number, isLeapmotorB10: boolean) {
  if (!isLeapmotorB10) return currentSoc >= 80 ? baseKw * 0.5 : baseKw;
  
  let maxKwAllowed = 80;
  for (let i = 0; i < leapmotorB10_Curve.length; i++) {
    if (currentSoc <= leapmotorB10_Curve[i].soc) {
      if (i === 0) { maxKwAllowed = leapmotorB10_Curve[0].max_kw; break; }
      const prev = leapmotorB10_Curve[i - 1];
      const next = leapmotorB10_Curve[i];
      const ratio = (currentSoc - prev.soc) / (next.soc - prev.soc);
      maxKwAllowed = prev.max_kw - (ratio * (prev.max_kw - next.max_kw));
      break;
    }
  }
  return Math.min(baseKw, maxKwAllowed);
}

export function calculateCharging(
  params: ChargeParams & { hasBackupPower?: boolean }, 
  baseTime: Date, 
  epcStatus: EPCStatus,
  stationLimits?: { maxSoc?: number, maxMins?: number } 
) {
  let waitMins = 0;
  if (params.carsInQueue > 0) {
    waitMins = Math.ceil((params.carsInQueue / params.activePorts) * params.avgWaitTimePerCarMins);
  }

  let currentSoc = params.currentPercent;
  
  let activeTargetSoc = params.limitMode === 'percent' ? params.targetPercent : 100;
  activeTargetSoc = Math.min(activeTargetSoc, stationLimits?.maxSoc || 100);

  let activeMaxMins = params.limitMode === 'time' ? params.targetMins : Infinity;
  activeMaxMins = Math.min(activeMaxMins, stationLimits?.maxMins || Infinity);

  let chargeMins = 0;
  let consumedKwh = 0;

  // မိနစ်အလိုက် Simulation ဖြင့် ကား၏ ရရှိမည့် % နှင့် ကုန်ကျမည့် kWh ကို အတိအကျတွက်ချက်ခြင်း
  while (currentSoc < activeTargetSoc && chargeMins < activeMaxMins) {
    let kw = getActiveKw(currentSoc, params.chargerKw, params.isLeapmotorB10);
    let addedKwh = kw / 60; 
    consumedKwh += addedKwh;
    currentSoc += (addedKwh / params.batteryCapacityKwh) * 100;
    chargeMins++;
  }

  const startTime = new Date(baseTime.getTime() + waitMins * 60000);
  const finishTime = new Date(startTime.getTime() + chargeMins * 60000);

  let blackoutMins = 0;
  if (!params.hasBackupPower) {
    try {
      const nextChangeTime = getNextEPCStatusChange(startTime, epcStatus);
      if (epcStatus === 'POWER_OFF') {
         blackoutMins = Math.max(0, Math.floor((nextChangeTime.getTime() - startTime.getTime()) / 60000));
      } else if (finishTime > nextChangeTime) {
         blackoutMins = 240; 
      }
    } catch(e) {
      blackoutMins = epcStatus === 'POWER_OFF' ? 120 : 0;
    }
  }

  const estimatedCost = Math.round(consumedKwh * params.pricePerKwh);
  const formatTime = (d: Date) => d.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
  const formatDuration = (m: number) => m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} mins` : `${m} mins`;

  return {
    waitDurationStr: formatDuration(waitMins),
    startTimeStr: formatTime(startTime),
    chargeDurationStr: formatDuration(chargeMins),
    finishTimeStr: formatTime(new Date(finishTime.getTime() + blackoutMins * 60000)),
    blackoutMins: blackoutMins,
    finalSoc: Math.floor(currentSoc),    
    actualChargeMins: chargeMins,
    consumedKwh: consumedKwh,
    estimatedCost: estimatedCost
  };
}
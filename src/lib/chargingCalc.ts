// src/lib/chargingCalc.ts
import { formatDuration } from './utils';
import { getNextEPCStatusChange, EPCStatus } from './epcSchedule';

export interface ChargeParams {
  vehicleId?: string;
  currentPercent: number;     
  targetPercent: number;      
  batteryCapacityKwh: number; 
  chargerKw: number;          
  isLeapmotorB10: boolean;    
  pricePerKwh: number;        
  carsInQueue: number;        
  activePorts: number;        
  avgWaitTimePerCarMins: number;
  hasBackupPower?: boolean;   // 👈 အသစ်
}

export function calculateCharging(params: ChargeParams, currentTime: Date = new Date(), currentEpcStatus: EPCStatus = 'POWER_ON') {
  const { currentPercent, targetPercent, batteryCapacityKwh, chargerKw, isLeapmotorB10, pricePerKwh, carsInQueue, activePorts, avgWaitTimePerCarMins, hasBackupPower } = params;

  const percentNeeded = targetPercent - currentPercent;
  if (percentNeeded <= 0) return { warning: 'Target သည် Current ထက် ကြီးရပါမည်။' };

  const actualKwhConsumed = ((percentNeeded / 100) * batteryCapacityKwh) * 1.05;

  let timeHours = 0;
  if (isLeapmotorB10) {
    timeHours = actualKwhConsumed / chargerKw;
  } else {
    if (targetPercent <= 80) {
      timeHours = actualKwhConsumed / chargerKw;
    } else {
      const percentUnder80 = Math.max(0, 80 - currentPercent);
      const percentOver80 = targetPercent - Math.max(80, currentPercent);
      timeHours = (((percentUnder80 / 100) * batteryCapacityKwh * 1.05) / chargerKw) + 
                  (((percentOver80 / 100) * batteryCapacityKwh * 1.05) / (chargerKw * 0.5));
    }
  }

  const waitMins = Math.round((carsInQueue / Math.max(1, activePorts)) * avgWaitTimePerCarMins);
  const chargeMins = Math.round(timeHours * 60); 

  let simT = new Date(currentTime);
  let simStat = currentEpcStatus;
  let waitMinsRemaining = waitMins;
  let queueBlackoutMins = 0;

  // 👈 hasBackupPower မှန်လျှင် မီးပျက်ချိန်များကို မတွက်တော့ပါ (24 Hours မီးလာသည်ဟု ယူဆမည်)
  if (!hasBackupPower) {
    while (waitMinsRemaining > 0) {
      let nextChange = getNextEPCStatusChange(simT, simStat);
      let interval = (nextChange.getTime() - simT.getTime()) / 60000;

      if (simStat === 'POWER_ON') {
        if (interval >= waitMinsRemaining) {
          simT = new Date(simT.getTime() + waitMinsRemaining * 60000);
          waitMinsRemaining = 0;
        } else {
          waitMinsRemaining -= interval;
          simT = nextChange;
          simStat = 'POWER_OFF';
        }
      } else { 
        queueBlackoutMins += interval;
        simT = nextChange;
        simStat = 'POWER_ON';
      }
    }

    if (waitMinsRemaining === 0 && simStat === 'POWER_OFF') {
      let nextChange = getNextEPCStatusChange(simT, simStat);
      queueBlackoutMins += (nextChange.getTime() - simT.getTime()) / 60000;
      simT = nextChange;
      simStat = 'POWER_ON';
    }
  } else {
    // 24/7 Power Station
    simT = new Date(simT.getTime() + waitMins * 60000);
  }

  const startChargingTime = new Date(simT); 

  let chargeLeft = chargeMins;
  let chargeBlackoutMins = 0;

  if (!hasBackupPower) {
    while (chargeLeft > 0) {
      let nextChange = getNextEPCStatusChange(simT, simStat);
      let interval = (nextChange.getTime() - simT.getTime()) / 60000;

      if (simStat === 'POWER_ON') {
        if (interval >= chargeLeft) {
          simT = new Date(simT.getTime() + chargeLeft * 60000);
          chargeLeft = 0;
        } else {
          chargeLeft -= interval;
          simT = nextChange;
          simStat = 'POWER_OFF';
        }
      } else {
        chargeBlackoutMins += interval;
        simT = nextChange;
        simStat = 'POWER_ON';
      }
    }
  } else {
     // 24/7 Power Station
     simT = new Date(simT.getTime() + chargeMins * 60000);
  }

  const finishChargingTime = simT;
  const totalMins = waitMins + queueBlackoutMins + chargeMins + chargeBlackoutMins;
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return {
    timeStr: formatDuration(totalMins / 60), 
    waitDurationStr: formatDuration(waitMins / 60),
    chargeDurationStr: formatDuration(chargeMins / 60),
    blackoutMins: Math.round(queueBlackoutMins + chargeBlackoutMins),
    startTimeStr: formatTime(startChargingTime),
    finishTimeStr: formatTime(finishChargingTime),
    kwh: parseFloat(actualKwhConsumed.toFixed(2)),
    cost: Math.round(actualKwhConsumed * pricePerKwh),
    warning: null
  };
}